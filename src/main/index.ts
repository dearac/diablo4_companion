import { app, shell, BrowserWindow, ipcMain, screen, globalShortcut } from 'electron'
import { join, dirname } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { existsSync, mkdirSync } from 'fs'
import type Store from 'electron-store'
import { HotkeyService } from './services/HotkeyService'
import { getDataPaths } from './services/StorageService'
import { BuildImportService } from './services/BuildImportService'
import { BuildRepository } from './services/BuildRepository'
import { ProcessManager } from './services/ProcessManager'
import { D4BuildsScraper } from './scrapers/D4BuildsScraper'
import { AutoUpdateService } from './services/AutoUpdateService'
import { ScanService } from './services/ScanService'
import { ScreenCaptureService } from './services/ScreenCaptureService'
import { EquippedGearStore } from './services/EquippedGearStore'
import { ScanHistoryStore } from './services/ScanHistoryStore'
import type { RawBuildData } from '../shared/types'
import type { ImportProgress } from './scrapers/BuildScraper'

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
let d4BuildsScraper: D4BuildsScraper
let scanService: ScanService

/**
 * Two-window architecture:
 * - configWindow: Normal desktop window for importing builds (650×500)
 * - overlayWindow: Transparent, frameless, always-on-top overlay for in-game HUD
 */
let configWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null

/** The detach window — shows a single paragon board for alignment */
let detachWindow: BrowserWindow | null = null

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

  // Register supported scrapers (d4builds only)
  d4BuildsScraper = new D4BuildsScraper(dataPaths.classes)
  buildService.registerScraper(d4BuildsScraper)

  // Initialize scan pipeline services
  const captureService = new ScreenCaptureService(dataPaths.scans)
  const equippedStore = new EquippedGearStore(join(dataPaths.userData, 'equipped-gear.json'))
  const scanHistoryStore = new ScanHistoryStore(join(dataPaths.userData, 'scan-history.json'))
  const sidecarDir = is.dev
    ? join(app.getAppPath(), 'sidecar', 'bin')
    : join(process.resourcesPath, 'sidecar', 'bin')
  scanService = new ScanService(captureService, equippedStore, scanHistoryStore, sidecarDir)
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
// DETACH WINDOW — Single paragon board overlay
// ============================================================

/**
 * Creates the Detach Window — a transparent, frameless, always-on-top
 * window that shows a single paragon board for alignment over the game.
 *
 * Unlike the main overlay, this window is:
 * - User-resizable (OS-level handles)
 * - Centered on screen at 600×600
 * - NOT click-through by default (user clicks Lock to enable)
 *
 * @param boardIndex - The index of the board to detach
 */
function createDetachWindow(boardIndex: number): void {
  // Close any existing detach window before opening a new one
  if (detachWindow) {
    detachWindow.close()
    detachWindow = null
  }

  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenW, height: screenH } = primaryDisplay.workAreaSize

  detachWindow = new BrowserWindow({
    width: 600,
    height: 600,
    x: Math.round(screenW / 2 - 300),
    y: Math.round(screenH / 2 - 300),
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    hasShadow: false,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  detachWindow.on('ready-to-show', () => {
    detachWindow?.show()
    detachWindow?.setAlwaysOnTop(true, 'screen-saver')
  })

  detachWindow.on('closed', () => {
    detachWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    detachWindow.loadURL(`${devUrl}/detach.html`)
  } else {
    detachWindow.loadFile(join(__dirname, '../renderer/detach.html'))
  }

  // Send the board data once the window is ready
  detachWindow.webContents.once('did-finish-load', () => {
    if (!currentBuildData || !detachWindow) return
    const board = currentBuildData.paragonBoards[boardIndex]
    if (!board) return

    // Also send the saved opacity
    const savedOpacity = store?.get('paragon-detach-opacity', 50) as number
    detachWindow.webContents.send('detach-board-data', { board, opacity: savedOpacity })
  })
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

  // Let the renderer query which hotkeys registered successfully
  ipcMain.handle('get-hotkey-status', () => {
    return hotkeyStatus
  })

  // Reset all hotkeys to factory defaults
  ipcMain.handle('reset-hotkeys', () => {
    hotkeyService.resetAll()
    registerGlobalHotkeys()
    return hotkeyService.getAllHotkeys()
  })

  /**
   * Imports a build from a URL.
   * Hands off to BuildImportService which uses the correct scraper.
   * Stores the result so the overlay can receive it when it's ready.
   */
  ipcMain.handle('import-build', async (_event, url: string) => {
    try {
      // Send progress updates to the config window as each import phase completes
      const onProgress = (progress: ImportProgress): void => {
        configWindow?.webContents.send('import-progress', progress)
      }
      const result = await buildService.importFromUrl(url, onProgress)
      currentBuildData = result

      // Auto-save the imported build (async — doesn't block main process)
      const site = buildService.detectSite(url)
      const saved = await buildRepo.save(result, url, site)

      return { build: result, savedId: saved.id }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Import failed:', message)
      throw error
    }
  })

  // ---- Build Library IPC ----

  /** List all saved builds (async, uses in-memory cache) */
  ipcMain.handle('list-builds', async () => {
    return await buildRepo.listAll()
  })

  /** Load a specific saved build by ID (async) */
  ipcMain.handle('load-build', async (_event, id: string) => {
    const build = await buildRepo.load(id)
    if (!build) throw new Error(`Build not found: ${id}`)
    currentBuildData = build.data
    return build
  })

  /** Delete a saved build by ID (async) */
  ipcMain.handle('delete-build', async (_event, id: string) => {
    return await buildRepo.delete(id)
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

  // Clear paragon board cache (call after game updates)
  ipcMain.handle('clear-paragon-cache', () => {
    d4BuildsScraper.clearCache()
    return { success: true }
  })

  // ---- Scan Pipeline IPC ----

  /** Perform a full scan: capture → OCR → parse → compare/equip */
  ipcMain.handle('perform-scan', async () => {
    return await scanService.scan(currentBuildData)
  })

  /** Toggle between compare and equip scan modes */
  ipcMain.handle('toggle-scan-mode', () => {
    return scanService.toggleScanMode()
  })

  /** Get the current scan mode */
  ipcMain.handle('get-scan-mode', () => {
    return scanService.getScanMode()
  })

  /** Get all currently equipped gear */
  ipcMain.handle('get-equipped-gear', () => {
    return scanService.getEquippedGear()
  })

  /** Clear all equipped gear */
  ipcMain.handle('clear-equipped-gear', () => {
    scanService.clearEquippedGear()
    return { success: true }
  })

  /** Get scan history (compare-mode verdicts) */
  ipcMain.handle('get-scan-history', () => {
    return scanService.getScanHistory()
  })

  /** Clear scan history */
  ipcMain.handle('clear-scan-history', () => {
    scanService.clearScanHistory()
    return { success: true }
  })

  // ---- Paragon Detach IPC ----

  /** Open a detach window showing a single paragon board */
  ipcMain.on('detach-paragon-board', (_event, boardIndex: number) => {
    createDetachWindow(boardIndex)
  })

  /** Detach window signals it finished loading — send board data */
  ipcMain.on('detach-ready', () => {
    // Board data is sent via did-finish-load in createDetachWindow
  })

  /** Toggle click-through on the detach window */
  ipcMain.on(
    'detach-set-ignore-mouse',
    (_event, ignore: boolean, options?: { forward: boolean }) => {
      detachWindow?.setIgnoreMouseEvents(ignore, options)
    }
  )

  /** Save opacity preference to electron-store */
  ipcMain.on('detach-save-opacity', (_event, opacity: number) => {
    store?.set('paragon-detach-opacity', opacity)
  })

  /** Close the detach window */
  ipcMain.on('detach-close', () => {
    if (detachWindow) {
      detachWindow.close()
      detachWindow = null
    }
  })
}

// ============================================================
// GLOBAL HOTKEYS
// ============================================================

/** Tracks which hotkeys registered successfully with the OS */
let hotkeyStatus: Record<string, boolean> = {}

/**
 * Registers global keyboard shortcuts.
 *
 * These work even when our window isn't focused (i.e., while
 * the user is playing the game). Each hotkey triggers an action
 * that the renderer listens for via IPC.
 *
 * Checks the return value of globalShortcut.register() — it
 * returns false when another app has already claimed the key.
 * Logs success/failure and pushes status to both windows.
 */
function registerGlobalHotkeys(): void {
  // Always clear old shortcuts before setting new ones
  // to avoid duplicate registrations
  globalShortcut.unregisterAll()

  const hotkeys = hotkeyService.getAllHotkeys()
  const status: Record<string, boolean> = {}

  try {
    // Toggle overlay visibility
    if (hotkeys.toggle) {
      const ok = globalShortcut.register(hotkeys.toggle, () => {
        if (!overlayWindow) return
        if (overlayWindow.isVisible()) {
          overlayWindow.hide()
        } else {
          overlayWindow.show()
          overlayWindow.setAlwaysOnTop(true, 'screen-saver')
        }
      })
      status.toggle = ok
      console.log(`[Hotkeys] ${hotkeys.toggle} (toggle): ${ok ? '✓ registered' : '✗ FAILED — key may be claimed by another app'}`)
    }

    // Scan a gear tooltip — runs the full pipeline and sends result to overlay
    if (hotkeys.scan) {
      const ok = globalShortcut.register(hotkeys.scan, async () => {
        if (!overlayWindow) return
        try {
          const result = await scanService.scan(currentBuildData)
          overlayWindow.webContents.send('scan-result', result)
        } catch (err) {
          console.error('[Scan] Hotkey scan failed:', err)
          overlayWindow.webContents.send('scan-result', {
            mode: scanService.getScanMode(),
            verdict: null,
            equippedItem: null,
            error: err instanceof Error ? err.message : String(err)
          })
        }
      })
      status.scan = ok
      console.log(`[Hotkeys] ${hotkeys.scan} (scan): ${ok ? '✓ registered' : '✗ FAILED — key may be claimed by another app'}`)
    }

    // Open/close the gear report panel
    if (hotkeys.report) {
      const ok = globalShortcut.register(hotkeys.report, () => {
        overlayWindow?.webContents.send('trigger-report')
      })
      status.report = ok
      console.log(`[Hotkeys] ${hotkeys.report} (report): ${ok ? '✓ registered' : '✗ FAILED — key may be claimed by another app'}`)
    }

    // Escape closes the detach window if it's open
    if (!globalShortcut.isRegistered('Escape')) {
      globalShortcut.register('Escape', () => {
        if (detachWindow) {
          detachWindow.close()
          detachWindow = null
        }
      })
    }
  } catch (error) {
    console.error('[Hotkeys] Failed to register global hotkeys:', error)
  }

  hotkeyStatus = status

  // Push status to both windows so the UI can show success/failure
  configWindow?.webContents.send('hotkey-status', status)
  overlayWindow?.webContents.send('hotkey-status', status)
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

  // Initialize process manager and clean up any orphaned processes from previous runs
  const processManager = ProcessManager.getInstance()
  processManager.setDataDir(dataPaths.userData)
  processManager.cleanupStalePids()

  // Set up IPC communication between main and renderer
  setupIpcHandlers()

  // Create the config window (overlay is launched on demand)
  createConfigWindow()

  // Register keyboard shortcuts
  registerGlobalHotkeys()

  // ---- Auto-Update Check ----
  // Runs after the config window is visible so the user isn't
  // staring at a blank screen. Uses the public releases repo.
  const updater = new AutoUpdateService('dearac/diablo4_companion')

  updater
    .checkForUpdate(app.getVersion())
    .then(async (updateInfo) => {
      if (!updateInfo || !configWindow) return

      // Show native dialog with release notes
      const { dialog } = await import('electron')
      const { response } = await dialog.showMessageBox(configWindow, {
        type: 'info',
        title: 'Update Available',
        message: `A new version (v${updateInfo.version}) is available.\nYou are running v${app.getVersion()}.`,
        detail: updateInfo.releaseNotes || 'Bug fixes and improvements.',
        buttons: ['Update Now', 'Skip'],
        defaultId: 0,
        cancelId: 1
      })

      if (response !== 0) return // User clicked Skip

      // Notify renderer that download is starting
      configWindow.webContents.send('update-started')

      try {
        // Download the new exe
        await updater.downloadUpdate(updateInfo.downloadUrl, appDir, (progress) => {
          configWindow?.webContents.send('update-download-progress', progress)
        })

        // Generate and launch the swap script
        const scriptPath = updater.generateUpdateScript(appDir, process.pid)

        const { exec } = await import('child_process')
        exec(`start /min "" "${scriptPath}"`, { windowsHide: true })

        // Quit so the batch script can replace us
        app.quit()
      } catch (err) {
        console.error('[AutoUpdate] Download failed:', err)
        const { dialog: dlg } = await import('electron')
        dlg.showErrorBox(
          'Update Failed',
          'The update download failed. The app will continue normally.'
        )
      }
    })
    .catch((err) => {
      console.error('[AutoUpdate] Check failed:', err)
      // Silent fail — app continues normally
    })
})

// Clean up shortcuts and kill all tracked browser processes when the app closes
app.on('will-quit', async () => {
  globalShortcut.unregisterAll()
  await ProcessManager.getInstance().killAll()
})

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
