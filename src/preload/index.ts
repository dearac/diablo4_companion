import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { ScannedGearPiece, ScanMode } from '../shared/types'

/**
 * Custom API for Renderer process
 */
const api = {
  toggleAlwaysOnTop: (): void => ipcRenderer.send('toggle-always-on-top'),
  onAlwaysOnTopChanged: (callback: (isOnTop: boolean) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, isOnTop: boolean): void => callback(isOnTop)
    ipcRenderer.on('always-on-top-changed', subscription)
    return () => ipcRenderer.removeListener('always-on-top-changed', subscription)
  },
  getHotkeys: () => ipcRenderer.invoke('get-hotkeys'),
  setHotkey: (action: string, key: string) => ipcRenderer.invoke('set-hotkey', action, key),
  getHotkeyStatus: () => ipcRenderer.invoke('get-hotkey-status'),
  onHotkeyStatus: (callback: (status: Record<string, boolean>) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, status: Record<string, boolean>): void =>
      callback(status)
    ipcRenderer.on('hotkey-status', subscription)
    return () => ipcRenderer.removeListener('hotkey-status', subscription)
  },
  resetHotkeys: () => ipcRenderer.invoke('reset-hotkeys'),
  onScanStarted: (callback: () => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent): void => callback() // eslint-disable-line @typescript-eslint/no-unused-vars
    ipcRenderer.on('scan-started', subscription)
    return () => ipcRenderer.removeListener('scan-started', subscription)
  },
  onTriggerReport: (callback: () => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent): void => callback() // eslint-disable-line @typescript-eslint/no-unused-vars
    ipcRenderer.on('trigger-report', subscription)
    return () => ipcRenderer.removeListener('trigger-report', subscription)
  },
  quit: (): void => ipcRenderer.send('quit-app'),

  // Builds and persistence
  importBuild: (url: string) => ipcRenderer.invoke('import-build', url),
  getCurrentBuild: () => ipcRenderer.invoke('get-current-build'),
  onImportProgress: (
    callback: (progress: { step: number; totalSteps: number; label: string }) => void
  ): (() => void) => {
    const subscription = (
      _event: IpcRendererEvent,
      progress: { step: number; totalSteps: number; label: string }
    ): void => callback(progress)
    ipcRenderer.on('import-progress', subscription)
    return () => ipcRenderer.removeListener('import-progress', subscription)
  },
  listBuilds: () => ipcRenderer.invoke('list-builds'),
  loadBuild: (id: string) => ipcRenderer.invoke('load-build', id),
  deleteBuild: (id: string) => ipcRenderer.invoke('delete-build', id),

  // Updates
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateAvailable: (callback: (info: { version: string }) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, info: { version: string }): void =>
      callback(info)
    ipcRenderer.on('update-available', subscription)
    return () => ipcRenderer.removeListener('update-available', subscription)
  },
  onUpdateProgress: (
    callback: (progress: { percent: number; downloadedMB: number; totalMB: number }) => void
  ): (() => void) => {
    const subscription = (
      _event: IpcRendererEvent,
      progress: { percent: number; downloadedMB: number; totalMB: number }
    ): void => callback(progress)
    ipcRenderer.on('update-download-progress', subscription)
    return () => ipcRenderer.removeListener('update-download-progress', subscription)
  },
  onUpdateDownloaded: (callback: () => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent): void => callback() // eslint-disable-line @typescript-eslint/no-unused-vars
    ipcRenderer.on('update-downloaded', subscription)
    return () => ipcRenderer.removeListener('update-downloaded', subscription)
  },
  onUpdateStarted: (callback: () => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent): void => callback() // eslint-disable-line @typescript-eslint/no-unused-vars
    ipcRenderer.on('update-started', subscription)
    return () => ipcRenderer.removeListener('update-started', subscription)
  },

  // Scan pipeline and results
  performScan: () => ipcRenderer.invoke('perform-scan'),
  onScanResult: (callback: (result: unknown) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, result: unknown): void => callback(result)
    ipcRenderer.on('scan-result', subscription)
    return () => ipcRenderer.removeListener('scan-result', subscription)
  },
  getScanHistory: () => ipcRenderer.invoke('get-scan-history'),
  clearScanHistory: () => ipcRenderer.invoke('clear-scan-history'),
  getEquippedGear: () => ipcRenderer.invoke('get-equipped-gear'),
  setEquippedGear: (gear: Record<string, ScannedGearPiece>) =>
    ipcRenderer.invoke('set-equipped-gear', gear),
  getScanMode: () => ipcRenderer.invoke('get-scan-mode'),
  setScanMode: (mode: ScanMode) => ipcRenderer.invoke('set-scan-mode', mode),
  toggleScanMode: () => ipcRenderer.invoke('toggle-scan-mode'),
  onLaunchOverlay: (callback: () => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent): void => callback() // eslint-disable-line @typescript-eslint/no-unused-vars
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
