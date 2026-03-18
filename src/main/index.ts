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
import { SidecarManager } from './services/SidecarManager'
import { ScreenCaptureService } from './services/ScreenCaptureService'
import { EquippedGearService } from './services/EquippedGearService'
import { GearComparisonEngine } from './services/GearComparisonEngine'
import { PythonBootstrapper } from './services/PythonBootstrapper'
import { D4BuildsScraper } from './scrapers/D4BuildsScraper'
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
let d4BuildsScraper: D4BuildsScraper

// OCR Scanner services
let screenCapture: ScreenCaptureService
let equippedGearService: EquippedGearService
let gearComparisonEngine: GearComparisonEngine

/** Current scan mode: 'equip' or 'inventory' */
let scanMode: 'equip' | 'inventory' = 'inventory'

/** Whether a scan is currently in progress (prevents overlapping scans) */
let scanInProgress = false

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

  // Register supported scrapers (d4builds only)
  d4BuildsScraper = new D4BuildsScraper(dataPaths.classes)
  buildService.registerScraper(d4BuildsScraper)

  // OCR Scanner services
  screenCapture = new ScreenCaptureService()
  equippedGearService = new EquippedGearService(dataPaths.builds)
  gearComparisonEngine = new GearComparisonEngine()
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

  // ---- OCR Scanner IPC ----

  // Set scan mode from overlay toggle
  ipcMain.on('set-scan-mode', (_event, mode: 'equip' | 'inventory') => {
    scanMode = mode
    console.log(`[Scanner] Scan mode set to: ${mode}`)
  })

  // Get equipped gear for a build
  ipcMain.handle('get-equipped-gear', async (_event, buildId: string) => {
    return await equippedGearService.getEquippedGear(buildId)
  })

  // Clear equipped gear for a build
  ipcMain.handle('clear-equipped-gear', async (_event, buildId: string) => {
    return await equippedGearService.clearAll(buildId)
  })
}

// ============================================================
// GLOBAL HOTKEYS
// ============================================================

/**
 * Performs a full tooltip scan:
 *   1. Hide overlay briefly (avoid self-capture)
 *   2. Capture the screen
 *   3. Send to Python sidecar for OCR
 *   4. Route to equip or compare based on mode
 *   5. Send result to overlay for display
 */
async function performScan(): Promise<void> {
  if (scanInProgress) {
    console.log('[Scanner] Scan already in progress, ignoring')
    return
  }
  if (!currentBuildData) {
    console.log('[Scanner] No build loaded, cannot scan')
    overlayWindow?.webContents.send('scan-result', {
      mode: scanMode,
      error: 'Load a build first before scanning'
    })
    return
  }

  scanInProgress = true

  try {
    // 1. Temporarily hide overlay to avoid capturing our own UI
    const wasVisible = overlayWindow?.isVisible() ?? false
    if (wasVisible) {
      overlayWindow?.hide()
      await new Promise((resolve) => setTimeout(resolve, 150))
    }

    // 2. Capture the screen and crop tooltip region
    const capture = await screenCapture.captureTooltip()

    // 3. Re-show overlay immediately
    if (wasVisible && overlayWindow) {
      overlayWindow.show()
      overlayWindow.setAlwaysOnTop(true, 'screen-saver')
    }

    // 4. Send cropped image to Python sidecar for OCR
    const sidecar = SidecarManager.getInstance(appDir)
    const imageB64 = capture.tooltipBuffer.toString('base64')

    const ocrResponse = await sidecar.send('ocr', {
      image: imageB64,
      debug: process.env.DEBUG_OCR === 'true',
      debugDir: join(dataPaths.scans, 'debug')
    })

    if (!ocrResponse.ok || !ocrResponse.result) {
      throw new Error(ocrResponse.error || 'OCR failed')
    }

    const result = ocrResponse.result as {
      success: boolean
      item?: Record<string, unknown>
      rawText?: string
      error?: string
    }

    if (!result.success || !result.item) {
      throw new Error(result.error || 'No item detected in tooltip')
    }

    // 5. Route based on scan mode
    const scannedItem = {
      ...result.item,
      scannedAt: new Date().toISOString()
    }

    if (scanMode === 'equip') {
      // Equip mode: save to equipped gear
      const currentBuildId = currentBuildData.name
        .replace(/[^a-zA-Z0-9]/g, '_')
        .substring(0, 40)

      const equipped = await equippedGearService.equipItem(
        currentBuildId,
        scannedItem as any
      )

      // Generate build verdicts after equipping
      const verdicts = gearComparisonEngine.generateBuildVerdict(
        equipped,
        currentBuildData.gearSlots
      )

      overlayWindow?.webContents.send('scan-result', {
        mode: 'equip',
        item: scannedItem
      })
      overlayWindow?.webContents.send('equipped-gear-updated', equipped)
      overlayWindow?.webContents.send('build-verdicts', verdicts)

    } else {
      // Inventory mode: compare against equipped + build
      const currentBuildId = currentBuildData.name
        .replace(/[^a-zA-Z0-9]/g, '_')
        .substring(0, 40)

      const equipped = await equippedGearService.getEquippedGear(currentBuildId)
      const verdict = gearComparisonEngine.evaluateInventoryItem(
        scannedItem as any,
        equipped,
        currentBuildData.gearSlots
      )

      overlayWindow?.webContents.send('scan-result', {
        mode: 'inventory',
        verdict
      })
      overlayWindow?.webContents.send('inventory-verdict', verdict)
    }

    console.log(`[Scanner] Scan complete (${scanMode} mode)`)

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[Scanner] Scan failed:', message)

    overlayWindow?.webContents.send('scan-result', {
      mode: scanMode,
      error: message
    })
  } finally {
    scanInProgress = false
  }
}

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
        performScan()
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

  // Bootstrap the Python OCR environment in the background.
  // This downloads Python + deps on first run (~30s).
  // The config window shows a status bar during setup.
  const sidecarDir = existsSync(join(appDir, 'resources', 'sidecar'))
    ? join(appDir, 'resources', 'sidecar')
    : join(appDir, 'sidecar')

  const bootstrapper = new PythonBootstrapper(dataPaths.userData, sidecarDir)

  bootstrapper.ensureReady((progress) => {
    // Send progress updates to config window
    configWindow?.webContents.send('python-bootstrap-progress', progress)
    console.log(`[Bootstrap] ${progress.stage}: ${progress.message}`)
  }).then(() => {
    // Wire the bootstrapped Python + Tesseract into the SidecarManager
    const sidecar = SidecarManager.getInstance(appDir)
    sidecar.setPythonPath(bootstrapper.getPythonPath())
    sidecar.setTesseractDir(bootstrapper.getTessdataDir())
    console.log('[Bootstrap] Python + Tesseract ready, SidecarManager configured')
  }).catch((err) => {
    console.error('[Bootstrap] OCR environment setup failed:', err)
    // OCR won't work, but the rest of the app still functions
  })
})

// Clean up shortcuts, kill sidecar, and kill all tracked browser processes
app.on('will-quit', async () => {
  globalShortcut.unregisterAll()
  try {
    await SidecarManager.getInstance(appDir).shutdown()
  } catch { /* sidecar may not have been started */ }
  await ProcessManager.getInstance().killAll()
})

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
