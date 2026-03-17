import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { RawBuildData } from '../shared/types'

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
