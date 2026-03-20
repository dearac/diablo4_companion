import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  RawBuildData,
  SavedBuild,
  ScanMode,
  ScanVerdict,
  ScannedGearPiece
} from '../shared/types'

// ============================================================
// PRELOAD SCRIPT — The Bridge Between Main and Renderer
// ============================================================
// Electron has a security model where the main process (Node.js)
// and the renderer (React) live in separate worlds. This "preload"
// script is the safe bridge between them.
//
// We expose a curated API here so the React UI can:
//   - Toggle mouse click-through mode
//   - Read and update hotkey settings
//   - Listen for scan/report triggers from global hotkeys
//   - Quit the app
//   - Import builds from URLs
//   - Launch and control the overlay window
// ============================================================

/**
 * Our custom API that the React renderer can call.
 * Everything here is available as `window.api.xxx` in the UI code.
 */
const api = {
  /**
   * Tells the main process to allow/block mouse clicks on the overlay.
   *
   * When `ignore` is true, clicks pass through to the game.
   * When `ignore` is false, clicks are captured by our UI.
   *
   * @param ignore - true = clicks pass through, false = clicks captured
   */
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }): void => {
    ipcRenderer.send('set-ignore-mouse-events', ignore, options)
  },

  /**
   * Gets the current hotkey configuration.
   * Returns something like { scan: 'F7', report: 'F8', toggle: 'F6' }
   */
  getHotkeys: (): Promise<Record<string, string>> => {
    return ipcRenderer.invoke('get-hotkeys')
  },

  /**
   * Changes a hotkey binding.
   * @param action - Which action to change ('scan', 'report', or 'toggle')
   * @param key - The new key, like 'F9' or 'Ctrl+Shift+G'
   */
  setHotkey: (action: string, key: string): Promise<Record<string, string>> => {
    return ipcRenderer.invoke('set-hotkey', action, key)
  },

  /**
   * Listens for when the user presses the scan hotkey.
   * The callback fires each time the key is pressed.
   */
  onTriggerScan: (callback: () => void): void => {
    ipcRenderer.on('trigger-scan', callback)
  },

  /**
   * Listens for when the user presses the report hotkey.
   * The callback fires each time the key is pressed.
   */
  onTriggerReport: (callback: () => void): void => {
    ipcRenderer.on('trigger-report', callback)
  },

  /**
   * Quits the application.
   */
  quit: (): void => {
    ipcRenderer.send('quit-app')
  },

  /**
   * Imports a build from a URL.
   * @param url - The build URL to import
   */
  importBuild: (url: string): Promise<RawBuildData> => {
    return ipcRenderer.invoke('import-build', url)
  },

  /**
   * Tells the main process to spawn the overlay window.
   */
  launchOverlay: (): void => {
    ipcRenderer.send('launch-overlay')
  },

  /**
   * Signals the main process that the overlay is ready to receive data.
   */
  overlayReady: (): void => {
    ipcRenderer.send('overlay-ready')
  },

  /**
   * Listens for build data sent from the main process to the overlay.
   */
  onBuildData: (callback: (data: RawBuildData) => void): void => {
    ipcRenderer.on('send-build-to-overlay', (_event, data) => callback(data))
  },

  /**
   * Tells the main process to close the overlay window.
   */
  closeOverlay: (): void => {
    ipcRenderer.send('close-overlay')
  },

  /**
   * Tells the main process to re-show the config window.
   */
  openConfig: (): void => {
    ipcRenderer.send('open-config')
  },

  /**
   * Lists all saved builds from disk.
   */
  listBuilds: (): Promise<SavedBuild[]> => {
    return ipcRenderer.invoke('list-builds')
  },

  /**
   * Loads a saved build by ID.
   */
  loadBuild: (id: string): Promise<SavedBuild> => {
    return ipcRenderer.invoke('load-build', id)
  },

  /**
   * Deletes a saved build by ID.
   */
  deleteBuild: (id: string): Promise<boolean> => {
    return ipcRenderer.invoke('delete-build', id)
  },

  /**
   * Clears the cached paragon board data.
   * Call after a game update changes paragon boards.
   */
  clearParagonCache: (): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('clear-paragon-cache')
  },

  /**
   * Listens for update download progress events from the main process.
   * Callback receives { percent, downloadedMB, totalMB }.
   */
  onUpdateProgress: (
    callback: (progress: { percent: number; downloadedMB: number; totalMB: number }) => void
  ): void => {
    ipcRenderer.on('update-download-progress', (_event, progress) => callback(progress))
  },

  /**
   * Listens for update-available notification from main process.
   * This is used when the update starts downloading after user accepts.
   */
  onUpdateStarted: (callback: () => void): void => {
    ipcRenderer.on('update-started', callback)
  },

  // ---- Scan Pipeline ----

  /**
   * Performs a full scan: capture → OCR → parse → compare/equip.
   */
  performScan: (): Promise<{
    mode: ScanMode
    verdict: ScanVerdict | null
    equippedItem: ScannedGearPiece | null
    error: string | null
  }> => {
    return ipcRenderer.invoke('perform-scan')
  },

  /**
   * Toggles between compare and equip scan modes.
   * Returns the new mode.
   */
  toggleScanMode: (): Promise<ScanMode> => {
    return ipcRenderer.invoke('toggle-scan-mode')
  },

  /**
   * Gets the current scan mode.
   */
  getScanMode: (): Promise<ScanMode> => {
    return ipcRenderer.invoke('get-scan-mode')
  },

  /**
   * Gets all currently equipped gear.
   */
  getEquippedGear: (): Promise<Record<string, ScannedGearPiece>> => {
    return ipcRenderer.invoke('get-equipped-gear')
  },

  /**
   * Clears all equipped gear.
   */
  clearEquippedGear: (): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('clear-equipped-gear')
  },

  /**
   * Listens for scan results pushed from the main process.
   * Fired when the scan hotkey triggers a scan.
   */
  onScanResult: (
    callback: (result: {
      mode: ScanMode
      verdict: ScanVerdict | null
      equippedItem: ScannedGearPiece | null
      error: string | null
    }) => void
  ): void => {
    ipcRenderer.on('scan-result', (_event, result) => callback(result))
  }
}

// ============================================================
// EXPOSE APIs TO THE RENDERER
// ============================================================

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
