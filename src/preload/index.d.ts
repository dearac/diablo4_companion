import { ElectronAPI } from '@electron-toolkit/preload'
import type { RawBuildData, SavedBuild } from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => void
      getHotkeys: () => Promise<Record<string, string>>
      setHotkey: (action: string, key: string) => Promise<Record<string, string>>
      onTriggerScan: (callback: () => void) => void
      onTriggerReport: (callback: () => void) => void
      quit: () => void
      importBuild: (url: string) => Promise<{ build: RawBuildData; savedId: string }>
      launchOverlay: () => void
      overlayReady: () => void
      onBuildData: (callback: (data: RawBuildData) => void) => void
      closeOverlay: () => void
      openConfig: () => void
      listBuilds: () => Promise<SavedBuild[]>
      loadBuild: (id: string) => Promise<SavedBuild>
      deleteBuild: (id: string) => Promise<boolean>
      clearParagonCache: () => Promise<{ success: boolean }>
      onUpdateProgress: (callback: (progress: { percent: number; downloadedMB: number; totalMB: number }) => void) => void
      onUpdateStarted: (callback: () => void) => void
      onBootstrapProgress: (callback: (progress: { stage: string; message: string; percent?: number }) => void) => void
      onOcrStatus: (callback: (status: { type: string; message: string }) => void) => void
      getBootstrapStatus: () => Promise<{ stage: string; message: string; percent?: number }>
    }
  }
}
