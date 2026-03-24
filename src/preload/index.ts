import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

/**
 * Custom API for Renderer process
 */
const api = {
  toggleAlwaysOnTop: () => ipcRenderer.send('toggle-always-on-top'),
  onAlwaysOnTopChanged: (callback: (isOnTop: boolean) => void): (() => void) => {
    const subscription = (_event: any, isOnTop: boolean) => callback(isOnTop)
    ipcRenderer.on('always-on-top-changed', subscription)
    return () => ipcRenderer.removeListener('always-on-top-changed', subscription)
  },
  getHotkeys: () => ipcRenderer.invoke('get-hotkeys'),
  setHotkey: (action: string, key: string) => ipcRenderer.invoke('set-hotkey', action, key),
  getHotkeyStatus: () => ipcRenderer.invoke('get-hotkey-status'),
  onHotkeyStatus: (callback: (status: Record<string, boolean>) => void): (() => void) => {
    const subscription = (_event: any, status: Record<string, boolean>) => callback(status)
    ipcRenderer.on('hotkey-status', subscription)
    return () => ipcRenderer.removeListener('hotkey-status', subscription)
  },
  resetHotkeys: () => ipcRenderer.invoke('reset-hotkeys'),
  onScanStarted: (callback: () => void): (() => void) => {
    const subscription = (_event: any) => callback()
    ipcRenderer.on('scan-started', subscription)
    return () => ipcRenderer.removeListener('scan-started', subscription)
  },
  onTriggerReport: (callback: () => void): (() => void) => {
    const subscription = (_event: any) => callback()
    ipcRenderer.on('trigger-report', subscription)
    return () => ipcRenderer.removeListener('trigger-report', subscription)
  },
  quit: () => ipcRenderer.send('quit-app'),

  // Builds and persistence
  importBuild: (url: string) => ipcRenderer.invoke('import-build', url),
  getCurrentBuild: () => ipcRenderer.invoke('get-current-build'),
  onImportProgress: (
    callback: (progress: { step: number; totalSteps: number; label: string }) => void
  ): (() => void) => {
    const subscription = (_event: any, progress: any) => callback(progress)
    ipcRenderer.on('import-progress', subscription)
    return () => ipcRenderer.removeListener('import-progress', subscription)
  },
  listBuilds: () => ipcRenderer.invoke('list-builds'),
  loadBuild: (id: string) => ipcRenderer.invoke('load-build', id),
  deleteBuild: (id: string) => ipcRenderer.invoke('delete-build', id),

  // Updates
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  onUpdateProgress: (
    callback: (progress: { percent: number; downloadedMB: number; totalMB: number }) => void
  ): (() => void) => {
    const subscription = (_event: any, progress: any) => callback(progress)
    ipcRenderer.on('update-progress', subscription)
    return () => ipcRenderer.removeListener('update-progress', subscription)
  },
  onUpdateStarted: (callback: () => void): (() => void) => {
    const subscription = (_event: any) => callback()
    ipcRenderer.on('update-started', subscription)
    return () => ipcRenderer.removeListener('update-started', subscription)
  },

  // Scan pipeline and results
  performScan: () => ipcRenderer.invoke('perform-scan'),
  onScanResult: (callback: (result: any) => void): (() => void) => {
    const subscription = (_event: any, result: any) => callback(result)
    ipcRenderer.on('scan-result', subscription)
    return () => ipcRenderer.removeListener('scan-result', subscription)
  },
  getScanHistory: () => ipcRenderer.invoke('get-scan-history'),
  clearScanHistory: () => ipcRenderer.invoke('clear-scan-history'),
  getEquippedGear: () => ipcRenderer.invoke('get-equipped-gear'),
  setEquippedGear: (gear: any) => ipcRenderer.invoke('set-equipped-gear', gear),
  getScanMode: () => ipcRenderer.invoke('get-scan-mode'),
  setScanMode: (mode: any) => ipcRenderer.invoke('set-scan-mode', mode),
  onLaunchOverlay: (callback: () => void): (() => void) => {
    const subscription = (_event: any) => callback()
    ipcRenderer.on('launch-overlay', subscription)
    return () => ipcRenderer.removeListener('launch-overlay', subscription)
  },

  // Maintenance actions
  clearParagonCache: () => ipcRenderer.invoke('clear-paragon-cache'),
  clearBoardCalibration: () => ipcRenderer.invoke('clear-board-calibration'),
  clearEquippedGear: () => ipcRenderer.invoke('clear-equipped-gear')
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in d.ts)
  window.electron = electronAPI
  // @ts-ignore (define in d.ts)
  window.api = api
}
