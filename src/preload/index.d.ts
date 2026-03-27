import { ElectronAPI } from '@electron-toolkit/preload'
import {
  RawBuildData,
  SavedBuild,
  ScanMode,
  ScanResult,
  ScanHistoryEntry,
  ScannedGearPiece,
  IParagonBoard
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
      getUpdateStatus: () => Promise<Record<string, unknown>>
      downloadUpdate: () => Promise<void>
      installUpdate: () => Promise<void>
      onUpdateAvailable: (callback: (info: { version: string }) => void) => () => void
      onUpdateProgress: (
        callback: (progress: { percent: number; downloadedMB: number; totalMB: number }) => void
      ) => () => void
      onUpdateDownloaded: (callback: () => void) => () => void
      onUpdateStarted: (callback: () => void) => () => void
      // Scan pipeline
      performScan: () => Promise<{
        mode: ScanMode
        verdict: ScanResult['verdict']
        equippedItem: ScanResult['equippedItem']
        error: string | null
      }>
      onScanResult: (callback: (result: ScanResult) => void) => () => void
      getScanHistory: () => Promise<ScanHistoryEntry[]>
      clearScanHistory: () => Promise<void>
      updateScanHistoryEntry: (
        scannedAt: number,
        updatedItem: ScannedGearPiece
      ) => Promise<{ success: boolean }>
      getEquippedGear: () => Promise<Record<string, ScannedGearPiece>>
      setEquippedGear: (gear: Record<string, ScannedGearPiece>) => Promise<void>
      getScanMode: () => Promise<ScanMode>
      setScanMode: (mode: ScanMode) => Promise<void>
      toggleScanMode: () => Promise<ScanMode>
      onLaunchOverlay: (callback: () => void) => () => void
      // Overlay IPC
      onBuildData: (callback: (data: RawBuildData) => void) => () => void
      overlayReady: () => void
      setIgnoreMouseEvents: (ignore: boolean, opts?: { forward: boolean }) => void
      closeOverlay: () => void
      openConfig: () => void
      detachParagonBoard: (boardIndex: number) => void
      // Detach window IPC
      onDetachBoardData: (
        callback: (data: {
          board: IParagonBoard
          opacity: number
          boardNumber: number
          boardTotal: number
          inset?: number
        }) => void
      ) => () => void
      detachSaveOpacity: (opacity: number) => void
      detachSaveInset: (inset: number) => void
      detachMoveWindow: (dx: number, dy: number) => void
      detachSetIgnoreMouse: (ignore: boolean, opts?: { forward: boolean }) => void
      detachSavePosition: () => void
      detachClose: () => void
      // Maintenance
      clearParagonCache: () => Promise<{ success: boolean }>
      clearBoardCalibration: () => Promise<{ success: boolean }>
      clearEquippedGear: () => Promise<{ success: boolean }>
    }
  }
}
