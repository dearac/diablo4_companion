import { app, shell, BrowserWindow, ipcMain, screen, globalShortcut } from 'electron'
import { join, dirname } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { existsSync, mkdirSync } from 'fs'
import type Store from 'electron-store'
import { HotkeyService } from './services/HotkeyService'
import { getDataPaths } from './services/StorageService'
import { BuildImportService } from './services/BuildImportService'
import { BuildRepository } from './services/BuildRepository'
import { MaxrollScraper } from './scrapers/MaxrollScraper'
import { D4BuildsScraper } from './scrapers/D4BuildsScraper'
import { IcyVeinsScraper } from './scrapers/IcyVeinsScraper'
import type { RawBuildData } from '../shared/types'

// ============================================================
// PORTABLE DATA DIRECTORY SETUP
// ============================================================
// The most important rule: ALL data stays in the app's folder.
// We figure out where the .exe lives and create a "data" subfolder
// there. Nothing goes to %APPDATA% or any system directory.
// ============================================================

/**
 * Finds the directory where the app is running from.
 * In development: uses the project root.
 * In production: uses the folder containing the .exe file.
 * For single-file portable builds: uses PORTABLE_EXECUTABLE_DIR.
 */
function getBaseDir(): string {
  if (is.dev) return app.getAppPath()
  return process.env.PORTABLE_EXECUTABLE_DIR || dirname(app.getPath('exe'))
}

const appDir = getBaseDir()
const dataPaths = getDataPaths(appDir)

// Create all required data directories on startup
const dirsToCreate = [
  dataPaths.userData,
  dataPaths.builds,
  dataPaths.classes,
  dataPaths.icons,
  dataPaths.scans
]
for (const dir of dirsToCreate) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

// Tell Electron to store ALL its internal data in our portable folder
app.setPath('userData', dataPaths.userData)

// ============================================================
// STORE & SERVICES
// ============================================================

let store: Store
let hotkeyService: HotkeyService
let buildService: BuildImportService
let buildRepo: BuildRepository

/**
 * Two-window architecture:
 * - configWindow: Normal desktop window for importing builds (650×500)
 * - overlayWindow: Transparent, frameless, always-on-top overlay for in-game HUD
 */
let configWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null

/** Holds the most recently imported build data, shared between windows */
let currentBuildData: RawBuildData | null = null

/**
 * Initializes electron-store using dynamic import (ESM compatibility).
 * The store saves user settings like hotkey bindings.
 */
async function initStore(): Promise<void> {
  const { default: Store } = await import('electron-store')
  store = new Store()
  hotkeyService = new HotkeyService(store)
}

/**
 * Initializes all business services and scrapers.
 */
function initServices(): void {
  buildService = new BuildImportService()
  buildRepo = new BuildRepository(dataPaths.builds)

  // Register supported scrapers here
  buildService.registerScraper(new MaxrollScraper())
  buildService.registerScraper(new D4BuildsScraper())
  buildService.registerScraper(new IcyVeinsScraper())
}

// ============================================================
// CONFIG WINDOW — Normal desktop window for build import
// ============================================================

/**
 * Creates the Config Window — a resizable desktop window
 * where the user pastes build URLs and launches the overlay.
 * Defaults to 1280×800 with a minimum of 700×500.
 * The user can resize freely; all content scales responsively.
 */
function createConfigWindow(): void {
  configWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 700,
    minHeight: 500,
    center: true,
    resizable: true,
    autoHideMenuBar: true,
    title: 'Diablo IV Companion',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  configWindow.on('ready-to-show', () => {
    configWindow?.show()
  })

  configWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    configWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    configWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ============================================================
// OVERLAY WINDOW — Transparent in-game HUD
// ============================================================

/**
 * Creates (or re-shows) the Overlay Window.
 *
 * This window is:
 * - Transparent: you can see the game/desktop through it
 * - Frameless: no title bar, no window controls
 * - Always on top: stays above the game at 'screen-saver' level
 * - Full screen: covers the entire primary monitor
 * - Click-through by default: mouse clicks pass through to the game
 */
function createOverlayWindow(): void {
  if (overlayWindow) {
    overlayWindow.show()
    return
  }

  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.workAreaSize

  overlayWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  overlayWindow.on('ready-to-show', () => {
    overlayWindow?.show()
    overlayWindow?.setAlwaysOnTop(true, 'screen-saver')
    overlayWindow?.setIgnoreMouseEvents(true, { forward: true })
  })

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    // electron-vite dev serves overlay at /overlay.html
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    overlayWindow.loadURL(`${devUrl}/overlay.html`)
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/overlay.html'))
  }
}

// ============================================================
// IPC HANDLERS
// ============================================================

/**
 * Sets up all IPC communication between main and renderer processes.
 *
 * Handles:
 * - Mouse click-through toggling for the overlay
 * - Hotkey get/set
 * - Build import with result caching
 * - Overlay lifecycle (launch, ready, close)
 * - Config window re-show
 */
function setupIpcHandlers(): void {
  // Toggle mouse click-through on the overlay window
  ipcMain.on(
    'set-ignore-mouse-events',
    (_event, ignore: boolean, options?: { forward: boolean }) => {
      overlayWindow?.setIgnoreMouseEvents(ignore, options)
    }
  )

  // Let the renderer request the current hotkey settings
  ipcMain.handle('get-hotkeys', () => {
    return hotkeyService.getAllHotkeys()
  })

  // Let the renderer update a hotkey
  ipcMain.handle('set-hotkey', (_event, action: string, key: string) => {
    hotkeyService.setHotkey(action, key)
    registerGlobalHotkeys() // Re-register with the new keybinding
    return hotkeyService.getAllHotkeys()
  })

  /**
   * Imports a build from a URL.
   * Hands off to BuildImportService which uses the correct scraper.
   * Stores the result so the overlay can receive it when it's ready.
   */
  ipcMain.handle('import-build', async (_event, url: string) => {
    try {
      const result = await buildService.importFromUrl(url)
      currentBuildData = result

      // Auto-save the imported build
      const site = buildService.detectSite(url)
      const saved = buildRepo.save(result, url, site)

      return { build: result, savedId: saved.id }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Import failed:', message)
      throw error
    }
  })

  // ---- Build Library IPC ----

  /** List all saved builds */
  ipcMain.handle('list-builds', async () => {
    return buildRepo.listAll()
  })

  /** Load a specific saved build by ID */
  ipcMain.handle('load-build', async (_event, id: string) => {
    const build = buildRepo.load(id)
    if (!build) throw new Error(`Build not found: ${id}`)
    currentBuildData = build.data
    return build
  })

  /** Delete a saved build by ID */
  ipcMain.handle('delete-build', async (_event, id: string) => {
    return buildRepo.delete(id)
  })

  // Launch the overlay window
  ipcMain.on('launch-overlay', () => {
    createOverlayWindow()
  })

  // Overlay signals it finished loading — send build data
  ipcMain.on('overlay-ready', () => {
    if (overlayWindow && currentBuildData) {
      overlayWindow.webContents.send('send-build-to-overlay', currentBuildData)
    }
  })

  // Close overlay
  ipcMain.on('close-overlay', () => {
    if (overlayWindow) {
      overlayWindow.close()
      overlayWindow = null
    }
  })

  // Re-show config window from overlay
  ipcMain.on('open-config', () => {
    if (configWindow) {
      configWindow.show()
      configWindow.focus()
    }
  })

  // Quit the app
  ipcMain.on('quit-app', () => {
    app.quit()
  })
}

// ============================================================
// GLOBAL HOTKEYS
// ============================================================

/**
 * Registers global keyboard shortcuts.
 *
 * These work even when our window isn't focused (i.e., while
 * the user is playing the game). Each hotkey triggers an action
 * that the renderer listens for via IPC.
 */
function registerGlobalHotkeys(): void {
  // Always clear old shortcuts before setting new ones
  // to avoid duplicate registrations
  globalShortcut.unregisterAll()

  const hotkeys = hotkeyService.getAllHotkeys()

  try {
    // Toggle overlay visibility
    if (hotkeys.toggle) {
      globalShortcut.register(hotkeys.toggle, () => {
        if (!overlayWindow) return
        if (overlayWindow.isVisible()) {
          overlayWindow.hide()
        } else {
          overlayWindow.show()
          overlayWindow.setAlwaysOnTop(true, 'screen-saver')
        }
      })
    }

    // Scan a gear tooltip (captures screen, sends to OCR)
    if (hotkeys.scan) {
      globalShortcut.register(hotkeys.scan, () => {
        overlayWindow?.webContents.send('trigger-scan')
      })
    }

    // Open/close the gear report panel
    if (hotkeys.report) {
      globalShortcut.register(hotkeys.report, () => {
        overlayWindow?.webContents.send('trigger-report')
      })
    }
  } catch (error) {
    console.error('Failed to register global hotkeys:', error)
  }
}

// ============================================================
// APP LIFECYCLE
// ============================================================

app.whenReady().then(async () => {
  // Set app user model id for Windows
  electronApp.setAppUserModelId('com.diablo4-companion')

  // Enable DevTools shortcuts in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize persistent storage and services
  await initStore()
  initServices()

  // Set up IPC communication between main and renderer
  setupIpcHandlers()

  // Create the config window (overlay is launched on demand)
  createConfigWindow()

  // Register keyboard shortcuts
  registerGlobalHotkeys()
})

// Clean up shortcuts when the app closes
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
