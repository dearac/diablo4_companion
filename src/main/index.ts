import { app, shell, BrowserWindow, ipcMain, screen, globalShortcut } from 'electron'
import { join, dirname } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { existsSync, mkdirSync } from 'fs'
import type Store from 'electron-store'
import { HotkeyService } from './services/HotkeyService'
import { getDataPaths } from './services/StorageService'
import { BuildImportService } from './services/BuildImportService'
import { MaxrollScraper } from './scrapers/MaxrollScraper'
import { D4BuildsScraper } from './scrapers/D4BuildsScraper'
import { IcyVeinsScraper } from './scrapers/IcyVeinsScraper'

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
let mainWindow: BrowserWindow | null = null

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

  // Register supported scrapers here
  buildService.registerScraper(new MaxrollScraper())
  buildService.registerScraper(new D4BuildsScraper())
  buildService.registerScraper(new IcyVeinsScraper())
}

// ============================================================
// OVERLAY WINDOW
// ============================================================

/**
 * Creates the main overlay window.
 *
 * This window is:
 * - Transparent: you can see the game/desktop through it
 * - Frameless: no title bar, no window controls
 * - Always on top: stays above the game
 * - Full screen: covers the entire primary monitor
 * - Click-through by default: mouse clicks pass through to the game
 */
function createWindow(): void {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.workAreaSize

  mainWindow = new BrowserWindow({
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

  // Show the window once it's ready (avoids a brief white flash)
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    // 'screen-saver' level ensures we stay above full-screen borderless games
    mainWindow?.setAlwaysOnTop(true, 'screen-saver')
    // Start in click-through mode so the user can interact with the game
    mainWindow?.setIgnoreMouseEvents(true, { forward: true })
  })

  // Open external links in the default browser, not in our overlay
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load the app UI
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ============================================================
// IPC HANDLERS
// ============================================================

/**
 * Lets the renderer tell us when to allow/block mouse clicks.
 * When the user hovers over our UI elements, we stop ignoring mouse events.
 * When they move away, we go back to click-through mode.
 */
function setupIpcHandlers(): void {
  ipcMain.on(
    'set-ignore-mouse-events',
    (_event, ignore: boolean, options?: { forward: boolean }) => {
      mainWindow?.setIgnoreMouseEvents(ignore, options)
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
   */
  ipcMain.handle('import-build', async (_event, url: string) => {
    try {
      return await buildService.importFromUrl(url)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Import failed:', message)
      throw error
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
        if (!mainWindow) return
        if (mainWindow.isVisible()) {
          mainWindow.hide()
        } else {
          mainWindow.show()
          mainWindow.setAlwaysOnTop(true, 'screen-saver')
        }
      })
    }

    // Scan a gear tooltip (captures screen, sends to OCR)
    if (hotkeys.scan) {
      globalShortcut.register(hotkeys.scan, () => {
        mainWindow?.webContents.send('trigger-scan')
      })
    }

    // Open/close the gear report panel
    if (hotkeys.report) {
      globalShortcut.register(hotkeys.report, () => {
        mainWindow?.webContents.send('trigger-report')
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

  // Create the overlay window
  createWindow()

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
