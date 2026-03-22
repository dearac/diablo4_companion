import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  RawBuildData,
  SavedBuild,
  IParagonBoard,
  ScanMode,
  ScanVerdict,
  ScannedGearPiece,
  ScanHistoryEntry
} from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => void
      getHotkeys: () => Promise<Record<string, string>>
      setHotkey: (action: string, key: string) => Promise<Record<string, string>>
      getHotkeyStatus: () => Promise<Record<string, boolean>>
      onHotkeyStatus: (callback: (status: Record<string, boolean>) => void) => void
      resetHotkeys: () => Promise<Record<string, string>>
      onTriggerScan: (callback: () => void) => void
      onTriggerReport: (callback: () => void) => void
      quit: () => void
      importBuild: (url: string) => Promise<{ build: RawBuildData; savedId: string }>
      onImportProgress: (
        callback: (progress: { step: number; totalSteps: number; label: string }) => void
      ) => void
      launchOverlay: () => void
      overlayReady: () => void
      onBuildData: (callback: (data: RawBuildData) => void) => void
      closeOverlay: () => void
      openConfig: () => void
      listBuilds: () => Promise<SavedBuild[]>
      loadBuild: (id: string) => Promise<SavedBuild>
      deleteBuild: (id: string) => Promise<boolean>
      clearParagonCache: () => Promise<{ success: boolean }>
      onUpdateProgress: (
        callback: (progress: { percent: number; downloadedMB: number; totalMB: number }) => void
      ) => void
      onUpdateStarted: (callback: () => void) => void
      // Scan pipeline
      performScan: () => Promise<{
        mode: ScanMode
        verdict: ScanVerdict | null
        equippedItem: ScannedGearPiece | null
        error: string | null
      }>
      toggleScanMode: () => Promise<ScanMode>
      getScanMode: () => Promise<ScanMode>
      getEquippedGear: () => Promise<Record<string, ScannedGearPiece>>
      clearEquippedGear: () => Promise<{ success: boolean }>
      getScanHistory: () => Promise<ScanHistoryEntry[]>
      clearScanHistory: () => Promise<{ success: boolean }>
      onScanResult: (
        callback: (result: {
          mode: ScanMode
          verdict: ScanVerdict | null
          equippedItem: ScannedGearPiece | null
          error: string | null
        }) => void
      ) => void
      // Paragon Detach
      detachParagonBoard: (boardIndex: number) => void
      onDetachBoardData: (
        callback: (data: {
          board: IParagonBoard
          opacity: number
          inset: number
          boardNumber: number
          boardTotal: number
        }) => void
      ) => void
      detachSetIgnoreMouse: (ignore: boolean, options?: { forward: boolean }) => void
      detachSaveOpacity: (opacity: number) => void
      detachSaveInset: (inset: number) => void
      detachSavePosition: () => void
      detachClose: () => void
      detachMoveWindow: (dx: number, dy: number) => void
      // Board Calibration
      clearBoardCalibration: () => Promise<{ success: boolean }>
    }
  }
}
