import { app, shell, BrowserWindow, ipcMain, screen, globalShortcut } from 'electron'
import { join, dirname } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { existsSync, mkdirSync } from 'fs'
import type Store from 'electron-store'
import { HotkeyService } from './services/HotkeyService'
import { getDataPaths } from './services/StorageService'
import { initBuildImport, importBuild, detectSite, clearParagonCache } from './services/BuildImportService'
import { BuildRepository } from './services/BuildRepository'
import { AutoUpdateService } from './services/AutoUpdateService'
import { ScanService } from './services/ScanService'
import { ScreenCaptureService } from './services/ScreenCaptureService'
import { EquippedGearStore } from './services/EquippedGearStore'
import { ScanHistoryStore } from './services/ScanHistoryStore'
import { matchBoard } from './services/BoardScanService'
import { BoardPositionService } from './services/BoardPositionService'
import { runOcr } from './services/OcrService'
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
let buildRepo: BuildRepository
let scanService: ScanService
let boardPositionService: BoardPositionService

/**
 * Application Window:
 * - mainWindow: Single always-on-top window for build import and in-game HUD
 */
let mainWindow: BrowserWindow | null = null

/** The detach window — shows a single paragon board for alignment */
let detachWindow: BrowserWindow | null = null

/** Tracks which board to detach next when the user presses the detach hotkey */
let detachBoardIndex = 0

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
  initBuildImport(dataPaths.classes)
  buildRepo = new BuildRepository(dataPaths.builds)

  // Initialize scan pipeline services
  const captureService = new ScreenCaptureService(dataPaths.scans)
  const equippedStore = new EquippedGearStore(join(dataPaths.userData, 'equipped-gear.json'))
  const scanHistoryStore = new ScanHistoryStore(join(dataPaths.userData, 'scan-history.json'))
  const sidecarDir = is.dev
    ? join(app.getAppPath(), 'sidecar', 'bin')
    : join(process.resourcesPath, 'sidecar', 'bin')
  scanService = new ScanService(captureService, equippedStore, scanHistoryStore, sidecarDir)
  boardPositionService = new BoardPositionService()

  // Load saved board calibration if store is already initialized
  if (store) {
    const savedCalibration = store.get('board-calibration') as
      | { x: number; y: number; width: number; height: number }
      | undefined
    if (savedCalibration) {
      boardPositionService.loadCalibration(savedCalibration)
    }
  }
}

/**
 * Creates the Main Window — a resizable desktop window
 * that can be toggled to always-on-top overlay mode.
 * Defaults to 1280×800 with a minimum of 700×500.
 * The user can resize freely; all content scales responsively.
 */
function createMainWindow(): void {
  mainWindow = new BrowserWindow({
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

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
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
 * @param position - Optional screen coordinates to auto-position the window
 */
function createDetachWindow(
  boardIndex: number,
  position?: { x: number; y: number; width: number; height: number }
): void {
  // Close any existing detach window before opening a new one
  if (detachWindow) {
    detachWindow.close()
    detachWindow = null
  }

  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenW, height: screenH } = primaryDisplay.workAreaSize

  // Restore saved position if user previously repositioned the overlay
  const savedPos = store?.get('paragon-detach-position') as
    | { x: number; y: number; width: number; height: number }
    | undefined

  // Priority: saved position > calibration position > screen center
  const winW = savedPos?.width ?? (position ? position.width : 600)
  const winH = savedPos?.height ?? (position ? position.height : 600)
  const winX = savedPos?.x ?? (position ? position.x : Math.round(screenW / 2 - 300))
  const winY = savedPos?.y ?? (position ? position.y : Math.round(screenH / 2 - 300))

  detachWindow = new BrowserWindow({
    width: winW,
    height: winH,
    x: winX,
    y: winY,
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

  // Save position whenever the window is moved or resized
  const saveWindowBounds = (): void => {
    if (detachWindow) {
      const bounds = detachWindow.getBounds()
      store?.set('paragon-detach-position', bounds)
    }
  }
  detachWindow.on('moved', saveWindowBounds)
  detachWindow.on('resized', saveWindowBounds)

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

    // Also send the saved opacity/inset and board position info
    const savedOpacity = store?.get('paragon-detach-opacity', 50) as number
    const savedInset = store?.get('paragon-detach-inset', 7) as number
    detachWindow.webContents.send('detach-board-data', {
      board,
      opacity: savedOpacity,
      inset: savedInset,
      boardNumber: boardIndex + 1,
      boardTotal: currentBuildData.paragonBoards.length
    })
  })
}

/** The calibration snipping window */
let calibrateWindow: BrowserWindow | null = null

/**
 * Opens a full-screen transparent window where the user can drag-select
 * the paragon board area (snipping-tool style).
 *
 * The selected rectangle coordinates are sent back via IPC and saved
 * so subsequent F10 presses place the overlay at the exact position.
 */
function openCalibrationWindow(): void {
  if (calibrateWindow) {
    calibrateWindow.focus()
    return
  }

  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: sw, height: sh } = primaryDisplay.bounds

  calibrateWindow = new BrowserWindow({
    x: primaryDisplay.bounds.x,
    y: primaryDisplay.bounds.y,
    width: sw,
    height: sh,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    fullscreenable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  calibrateWindow.setAlwaysOnTop(true, 'screen-saver')

  // Listen for results via page title changes (data: URLs can't use preload IPC)
  calibrateWindow.webContents.on('page-title-updated', (_event, title) => {
    if (title.startsWith('CALIBRATE:')) {
      try {
        const region = JSON.parse(title.slice('CALIBRATE:'.length))
        boardPositionService.saveCalibration(region)
        store?.set('board-calibration', region)
        console.log('[BoardScan] ✓ Calibration saved! Press F10 on a node to scan.')
      } catch (err) {
        console.error('[BoardScan] Failed to parse calibration:', err)
      }
      if (calibrateWindow) {
        calibrateWindow.close()
        calibrateWindow = null
      }
    } else if (title === 'CANCEL') {
      if (calibrateWindow) {
        calibrateWindow.close()
        calibrateWindow = null
      }
    }
  })

  const html = `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    cursor: crosshair;
    user-select: none;
    overflow: hidden;
    background: transparent;
  }
  #backdrop {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.35);
  }
  #selection {
    position: fixed;
    border: 3px solid #ff3333;
    background: rgba(255, 50, 50, 0.08);
    box-shadow: 0 0 20px rgba(255, 50, 50, 0.4);
    display: none;
    pointer-events: none;
  }
  #instructions {
    position: fixed;
    top: 40px; left: 50%;
    transform: translateX(-50%);
    color: #fff;
    font: bold 20px/1.4 'Segoe UI', sans-serif;
    text-shadow: 0 2px 8px rgba(0,0,0,0.8);
    text-align: center;
    pointer-events: none;
    z-index: 10;
  }
  #instructions small {
    display: block; font-weight: normal;
    font-size: 14px; opacity: 0.7; margin-top: 4px;
  }
</style></head>
<body>
  <div id="backdrop"></div>
  <div id="selection"></div>
  <div id="instructions">
    Drag a rectangle around the paragon board
    <small>Press Escape to cancel</small>
  </div>
  <script>
    let startX = 0, startY = 0, dragging = false;
    const sel = document.getElementById('selection');
    const inst = document.getElementById('instructions');

    document.addEventListener('mousedown', (e) => {
      startX = e.screenX;
      startY = e.screenY;
      dragging = true;
      inst.style.display = 'none';
      sel.style.display = 'block';
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const x = Math.min(startX, e.screenX);
      const y = Math.min(startY, e.screenY);
      const w = Math.abs(e.screenX - startX);
      const h = Math.abs(e.screenY - startY);
      sel.style.left = x + 'px';
      sel.style.top = y + 'px';
      sel.style.width = w + 'px';
      sel.style.height = h + 'px';
    });

    document.addEventListener('mouseup', (e) => {
      if (!dragging) return;
      dragging = false;
      const x = Math.min(startX, e.screenX);
      const y = Math.min(startY, e.screenY);
      const w = Math.abs(e.screenX - startX);
      const h = Math.abs(e.screenY - startY);
      if (w > 50 && h > 50) {
        document.title = 'CALIBRATE:' + JSON.stringify({ x, y, width: w, height: h });
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.title = 'CANCEL';
      }
    });
  </script>
</body></html>`

  calibrateWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

  calibrateWindow.on('closed', () => {
    calibrateWindow = null
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
        mainWindow?.webContents.send('import-progress', progress)
      }
      const result = await importBuild(url, onProgress)
      currentBuildData = result

      // Reset detach cycling index for the new build
      detachBoardIndex = 0

      // Auto-save the imported build (async — doesn't block main process)
      const site = detectSite(url)
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

  /** Get the currently active build data */
  ipcMain.handle('get-current-build', () => {
    return currentBuildData
  })

  /** Load a specific saved build by ID (async) */
  ipcMain.handle('load-build', async (_event, id: string) => {
    const build = await buildRepo.load(id)
    if (!build) throw new Error(`Build not found: ${id}`)
    currentBuildData = build.data

    // Reset detach cycling index for the newly loaded build
    detachBoardIndex = 0

    return build
  })

  /** Delete a saved build by ID (async) */
  ipcMain.handle('delete-build', async (_event, id: string) => {
    return await buildRepo.delete(id)
  })


  // Quit the app
  ipcMain.on('quit-app', () => {
    app.quit()
  })

  // ---- Board Calibration IPC ----

  /** Receives the snipping rectangle from the calibration window */
  ipcMain.on(
    'save-calibration',
    (_event, region: { x: number; y: number; width: number; height: number }) => {
      boardPositionService.saveCalibration(region)
      store?.set('board-calibration', region)
      if (calibrateWindow) {
        calibrateWindow.close()
        calibrateWindow = null
      }
      console.log('[BoardScan] Calibration saved! Press F10 on a node to scan.')
    }
  )

  /** Cancels the calibration snipping */
  ipcMain.on('cancel-calibration', () => {
    if (calibrateWindow) {
      calibrateWindow.close()
      calibrateWindow = null
    }
  })

  /** Clears the saved calibration so the next F10 re-opens the snipping tool */
  ipcMain.handle('clear-board-calibration', () => {
    boardPositionService.clearCalibration()
    store?.delete('board-calibration')
    store?.delete('paragon-detach-position')
    return { success: true }
  })

  // Clear paragon board cache (call after game updates)
  ipcMain.handle('clear-paragon-cache', () => {
    clearParagonCache()
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

  /** Bulk-set all equipped gear (used for testing / external data import) */
  ipcMain.handle('set-equipped-gear', (_event, gear: Record<string, unknown>) => {
    scanService.setEquippedGear(gear as Record<string, import('../shared/types').ScannedGearPiece>)
    return { success: true }
  })

  /** Explicitly set the scan mode */
  ipcMain.handle('set-scan-mode', (_event, mode: import('../shared/types').ScanMode) => {
    scanService.setScanMode(mode)
    return scanService.getScanMode()
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

  /** Save inset preference to electron-store */
  ipcMain.on('detach-save-inset', (_event, inset: number) => {
    store?.set('paragon-detach-inset', inset)
  })

  /** Explicitly save the current detach window position (triggered by Save Position button) */
  ipcMain.on('detach-save-position', () => {
    if (detachWindow) {
      const bounds = detachWindow.getBounds()
      store?.set('paragon-detach-position', bounds)
      console.log(`[Detach] Position saved: (${bounds.x}, ${bounds.y}) ${bounds.width}x${bounds.height}`)
    }
  })

  /** Close the detach window */
  ipcMain.on('detach-close', () => {
    if (detachWindow) {
      detachWindow.close()
      detachWindow = null
    }
  })

  /** Move the detach window by a pixel delta (right-click drag) */
  ipcMain.on('detach-move-window', (_event, dx: number, dy: number) => {
    if (detachWindow) {
      const [x, y] = detachWindow.getPosition()
      detachWindow.setPosition(x + dx, y + dy)
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
    // Toggle show/hide — hides the entire window so the game is visible,
    // then brings it back as always-on-top when pressed again.
    if (hotkeys.toggle) {
      const ok = globalShortcut.register(hotkeys.toggle, () => {
        if (!mainWindow) return
        if (mainWindow.isVisible()) {
          mainWindow.hide()
          console.log('[Hotkeys] Window hidden')
        } else {
          mainWindow.show()
          mainWindow.setAlwaysOnTop(true, 'screen-saver')
          mainWindow.webContents.send('always-on-top-changed', true)
          console.log('[Hotkeys] Window shown (always-on-top)')
        }
      })
      status.toggle = ok
      console.log(
        `[Hotkeys] ${hotkeys.toggle} (toggle): ${ok ? '✓ registered' : '✗ FAILED'}`
      )
    }

    // Scan a gear tooltip — runs the full pipeline and sends result to main window
    if (hotkeys.scan) {
      const ok = globalShortcut.register(hotkeys.scan, async () => {
        if (!mainWindow) return
        try {
          // Play shutter sound by notifying renderer we started
          mainWindow.webContents.send('scan-started')
          const result = await scanService.scan(currentBuildData)
          mainWindow.webContents.send('scan-result', result)
        } catch (err) {
          console.error('[Scan] Hotkey scan failed:', err)
          mainWindow.webContents.send('scan-result', {
            mode: scanService.getScanMode(),
            verdict: null,
            equippedItem: null,
            error: err instanceof Error ? err.message : String(err)
          })
        }
      })
      status.scan = ok
      console.log(
        `[Hotkeys] ${hotkeys.scan} (scan): ${ok ? '✓ registered' : '✗ FAILED'}`
      )
    }

    // Report hotkey — same show/hide behavior as toggle
    if (hotkeys.report) {
      const ok = globalShortcut.register(hotkeys.report, () => {
        if (!mainWindow) return
        if (mainWindow.isVisible()) {
          mainWindow.hide()
        } else {
          mainWindow.show()
          mainWindow.setAlwaysOnTop(true, 'screen-saver')
          mainWindow.webContents.send('always-on-top-changed', true)
        }
      })
      status.report = ok
      console.log(
        `[Hotkeys] ${hotkeys.report} (report): ${ok ? '✓ registered' : '✗ FAILED'}`
      )
    }

    // Cycle through paragon boards — detach the next board
    if (hotkeys.detach) {
      const ok = globalShortcut.register(hotkeys.detach, () => {
        if (!currentBuildData || !currentBuildData.paragonBoards?.length) return
        const boards = currentBuildData.paragonBoards
        // Wrap around if past the end
        if (detachBoardIndex >= boards.length) detachBoardIndex = 0
        createDetachWindow(detachBoardIndex)
        detachBoardIndex++
      })
      status.detach = ok
      console.log(
        `[Hotkeys] ${hotkeys.detach} (detach): ${ok ? '✓ registered' : '✗ FAILED — key may be claimed by another app'}`
      )
    }

    // Board scan — two-step flow:
    //   Step 1 (no calibration): Open snipping overlay to define the board area
    //   Step 2 (calibrated): OCR scan → identify board → overlay at calibrated position
    if (hotkeys.boardScan) {
      const ok = globalShortcut.register(hotkeys.boardScan, async () => {
        if (!currentBuildData || !currentBuildData.paragonBoards?.length) {
          console.log('[BoardScan] No build loaded or no paragon boards')
          return
        }

        // If not calibrated, open the snipping overlay
        if (!boardPositionService.isCalibrated) {
          console.log('[BoardScan] No calibration — opening snipping tool')
          openCalibrationWindow()
          return
        }

        // Calibrated — run the scan pipeline
        try {
          console.log('[BoardScan] ═══ SCANNING ═══')

          const captureService = new ScreenCaptureService(dataPaths.scans)
          const imagePath = await captureService.captureFullScreen()
          console.log(`[BoardScan] Screenshot saved: ${imagePath}`)

          const sidecarDir = is.dev
            ? join(app.getAppPath(), 'sidecar', 'bin')
            : join(process.resourcesPath, 'sidecar', 'bin')
          const ocrResult = await runOcr(imagePath, sidecarDir)
          console.log(`[BoardScan] OCR text (first 200): ${ocrResult.text.substring(0, 200)}`)

          const match = matchBoard(ocrResult.text, currentBuildData.paragonBoards)

          if (match) {
            console.log(
              `[BoardScan] ✓ MATCHED: "${match.matchedNodeName}" → ` +
                `Board #${match.boardIndex + 1} "${match.boardName}" ` +
                `(confidence: ${match.confidence})`
            )
            // Place overlay at the calibrated position
            const boardRegion = boardPositionService.getBoardRegion()
            createDetachWindow(match.boardIndex, boardRegion)

            mainWindow?.webContents.send('board-scan-result', {
              success: true,
              ...match
            })
          } else {
            console.log('[BoardScan] ✗ No matching board found in OCR text')
            console.log('[BoardScan] Full OCR text:')
            ocrResult.lines.forEach((line, i) => {
              console.log(`[BoardScan]   [${i}] "${line.text}"`)
            })

            mainWindow?.webContents.send('board-scan-result', {
              success: false,
              error: 'No matching paragon board found. Try hovering over a Legendary or Rare node.'
            })
          }
        } catch (err) {
          console.error('[BoardScan] Pipeline error:', err)
          mainWindow?.webContents.send('board-scan-result', {
            success: false,
            error: err instanceof Error ? err.message : String(err)
          })
        }
      })
      status.boardScan = ok
      console.log(
        `[Hotkeys] ${hotkeys.boardScan} (boardScan): ${ok ? '✓ registered' : '✗ FAILED — key may be claimed by another app'}`
      )
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

  // Push status to mainWindow so the UI can show success/failure
  mainWindow?.webContents.send('hotkey-status', status)
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

  // Show the main window immediately — its HTML/React loads in parallel
  // with service initialization so the user sees the UI right away
  createMainWindow()

  // Initialize persistent storage and services
  await initStore()
  initServices()

  // Set up IPC communication between main and renderer
  setupIpcHandlers()

  // Register keyboard shortcuts
  registerGlobalHotkeys()

  // ---- Auto-Update (electron-updater) ----
  // Checks GitHub Releases for new NSIS installers.
  // Does NOT auto-download — sends 'update-available' to the renderer,
  // which prompts the user before downloading.
  // Defer check so the window finishes rendering first.
  const updater = new AutoUpdateService(mainWindow!)

  // IPC: renderer requests update status (on mount)
  ipcMain.handle('get-update-status', () => {
    updater.checkForUpdates()
    return { version: app.getVersion() }
  })

  // IPC: renderer requests download after user approves
  ipcMain.handle('download-update', async () => {
    await updater.downloadUpdate()
  })

  // IPC: renderer requests install (quit + install)
  ipcMain.on('install-update', () => {
    updater.installUpdate()
  })

  setTimeout(() => {
    updater.checkForUpdates()
  }, 3000)
})

// Clean up shortcuts and kill all tracked browser processes when the app closes
app.on('will-quit', async () => {
  globalShortcut.unregisterAll()
})

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
