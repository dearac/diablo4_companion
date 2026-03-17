import { ElectronAPI } from '@electron-toolkit/preload'
import type { RawBuildData } from '../shared/types'

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
      importBuild: (url: string) => Promise<RawBuildData>
      launchOverlay: () => void
      overlayReady: () => void
      onBuildData: (callback: (data: RawBuildData) => void) => void
      closeOverlay: () => void
      openConfig: () => void
    }
  }
}
