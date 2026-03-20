import { ScreenCaptureService } from './ScreenCaptureService'
import { runOcr } from './OcrService'
import { parseTooltip } from './GearParser'
import { compareGear } from './GearComparer'
import { EquippedGearStore } from './EquippedGearStore'
import type { ScanMode, ScanVerdict, ScannedGearPiece, RawBuildData } from '../../shared/types'

/**
 * ScanService is the orchestrator for the entire scan pipeline.
 *
 * Flow: Hotkey → Screenshot → OCR → Parse → Compare or Equip
 *
 * Manages the current scan mode (compare vs equip) and coordinates
 * all sub-services to produce a final ScanVerdict or equip confirmation.
 */
export class ScanService {
  private captureService: ScreenCaptureService
  private equippedStore: EquippedGearStore
  private sidecarDir: string
  private scanMode: ScanMode = 'compare'

  constructor(
    captureService: ScreenCaptureService,
    equippedStore: EquippedGearStore,
    sidecarDir: string
  ) {
    this.captureService = captureService
    this.equippedStore = equippedStore
    this.sidecarDir = sidecarDir
  }

  getScanMode(): ScanMode {
    return this.scanMode
  }

  setScanMode(mode: ScanMode): void {
    this.scanMode = mode
  }

  toggleScanMode(): ScanMode {
    this.scanMode = this.scanMode === 'compare' ? 'equip' : 'compare'
    return this.scanMode
  }

  /** Returns all currently equipped gear (pass-through to EquippedGearStore). */
  getEquippedGear(): Record<string, ScannedGearPiece> {
    return this.equippedStore.getAllEquipped()
  }

  /** Clears all equipped gear (pass-through to EquippedGearStore). */
  clearEquippedGear(): void {
    this.equippedStore.clearAll()
  }

  /**
   * Executes the full scan pipeline.
   *
   * @param buildData - The currently loaded build (needed for compare mode)
   * @returns Either a ScanVerdict (compare) or an equip confirmation
   */
  async scan(buildData: RawBuildData | null): Promise<{
    mode: ScanMode
    verdict: ScanVerdict | null
    equippedItem: ScannedGearPiece | null
    error: string | null
  }> {
    try {
      // Step 1: Capture screen
      const imagePath = await this.captureService.captureScreen()

      // Step 2: Run OCR
      const ocrResult = await runOcr(imagePath, this.sidecarDir)

      // Step 3: Parse into structured gear piece
      const lineTexts = ocrResult.lines.map(l => l.text)
      const scannedItem = parseTooltip(lineTexts)

      // Step 4: Mode-specific logic
      if (this.scanMode === 'equip') {
        this.equippedStore.equip(scannedItem)
        return { mode: 'equip', verdict: null, equippedItem: scannedItem, error: null }
      }

      // Compare mode: need a build loaded
      if (!buildData) {
        return { mode: 'compare', verdict: null, equippedItem: null,
          error: 'Load a build first before scanning' }
      }

      // Find matching build slot
      const buildSlot = buildData.gearSlots.find(
        gs => gs.slot.toLowerCase() === scannedItem.slot.toLowerCase()
      )

      if (!buildSlot) {
        return { mode: 'compare', verdict: null, equippedItem: null,
          error: `No build data for slot: ${scannedItem.slot}` }
      }

      // Get currently equipped item for this slot (if any)
      const equipped = this.equippedStore.getEquipped(scannedItem.slot)

      // Score it
      const verdict = compareGear(scannedItem, buildSlot, equipped)

      return { mode: 'compare', verdict, equippedItem: null, error: null }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { mode: this.scanMode, verdict: null, equippedItem: null, error: message }
    }
  }
}
