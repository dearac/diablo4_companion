import { ElectronAPI } from '@electron-toolkit/preload'
import {
  RawBuildData,
  SavedBuild,
  ScanMode,
  ScanResult,
  ScanHistoryEntry,
  ScannedGearPiece
} from './shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      toggleAlwaysOnTop: () => void
      onAlwaysOnTopChanged: (callback: (isOnTop: boolean) => void) => () => void
      getHotkeys: () => Promise<Record<string, string>>
      setHotkey: (action: string, key: string) => Promise<Record<string, string>>
      getHotkeyStatus: () => Promise<Record<string, boolean>>
      onHotkeyStatus: (callback: (status: Record<string, boolean>) => void) => () => void
      resetHotkeys: () => Promise<Record<string, string>>
      onScanStarted: (callback: () => void) => () => void
      onTriggerReport: (callback: () => void) => () => void
      quit: () => void
      importBuild: (url: string) => Promise<{ build: RawBuildData; savedId: string }>
      getCurrentBuild: () => Promise<RawBuildData | null>
      onImportProgress: (
        callback: (progress: { step: number; totalSteps: number; label: string }) => void
      ) => () => void
      listBuilds: () => Promise<SavedBuild[]>
      loadBuild: (id: string) => Promise<SavedBuild>
      deleteBuild: (id: string) => Promise<boolean>
      getUpdateStatus: () => Promise<any>
      onUpdateProgress: (
        callback: (progress: { percent: number; downloadedMB: number; totalMB: number }) => void
      ) => () => void
      onUpdateStarted: (callback: () => void) => () => void
      // Scan pipeline
      performScan: () => Promise<{
        mode: ScanMode
        verdict: any
        equippedItem: any
        error: string | null
      }>
      onScanResult: (callback: (result: ScanResult) => void) => () => void
      getScanHistory: () => Promise<ScanHistoryEntry[]>
      clearScanHistory: () => Promise<void>
      getEquippedGear: () => Promise<Record<string, ScannedGearPiece>>
      setEquippedGear: (gear: Record<string, ScannedGearPiece>) => Promise<void>
      getScanMode: () => Promise<ScanMode>
      setScanMode: (mode: ScanMode) => Promise<void>
      onLaunchOverlay: (callback: () => void) => () => void
      // Maintenance
      clearParagonCache: () => Promise<{ success: boolean }>
      clearBoardCalibration: () => Promise<{ success: boolean }>
      clearEquippedGear: () => Promise<{ success: boolean }>
    }
  }
}
