import { ScreenCaptureService } from './ScreenCaptureService'
import { runOcr } from './OcrService'
import { parseTooltip } from './GearParser'
import { compareGear } from '../../shared/GearComparer'
import { EquippedGearStore } from './EquippedGearStore'
import { ScanHistoryStore } from './ScanHistoryStore'
import { ScanRecordingStore } from './ScanRecordingStore'
import { normalizeSlot } from '../../shared/SlotNormalizer'
import type { ScanHistoryEntry } from '../../shared/types'
import type { ScanMode, ScanVerdict, ScannedGearPiece, RawBuildData } from '../../shared/types'
import { statSync } from 'fs'
import { basename } from 'path'

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
  private scanHistory: ScanHistoryStore
  private sidecarDir: string
  private scanMode: ScanMode = 'compare'
  private recordingStore: ScanRecordingStore | null = null
  private recordingEnabled = false

  constructor(
    captureService: ScreenCaptureService,
    equippedStore: EquippedGearStore,
    scanHistory: ScanHistoryStore,
    sidecarDir: string,
    recordingStore?: ScanRecordingStore
  ) {
    this.captureService = captureService
    this.equippedStore = equippedStore
    this.scanHistory = scanHistory
    this.sidecarDir = sidecarDir
    this.recordingStore = recordingStore ?? null
  }

  enableRecording(): void {
    this.recordingEnabled = true
    console.log('[SCAN] ── RECORDING ENABLED ──')
  }

  disableRecording(): void {
    this.recordingEnabled = false
    console.log('[SCAN] ── RECORDING DISABLED ──')
  }

  isRecordingEnabled(): boolean {
    return this.recordingEnabled
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

  /** Bulk-replace all equipped gear — used for test mock injection. */
  setEquippedGear(gear: Record<string, ScannedGearPiece>): void {
    this.equippedStore.setAll(gear)
  }

  /** Returns all scan history entries (pass-through to ScanHistoryStore). */
  getScanHistory(): ScanHistoryEntry[] {
    return this.scanHistory.getAll()
  }

  /** Clears all scan history (pass-through to ScanHistoryStore). */
  clearScanHistory(): void {
    this.scanHistory.clearAll()
  }

  /**
   * Updates a scan history entry's scannedItem in-place (pass-through to ScanHistoryStore).
   * Enables the inline affix tag editor to re-classify affixes without re-scanning.
   */
  updateScanHistoryEntry(
    scannedAt: number,
    updatedItem: import('../../shared/types').ScannedGearPiece
  ): boolean {
    return this.scanHistory.updateEntry(scannedAt, updatedItem)
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
      const fileName = basename(imagePath)
      const fileSize = statSync(imagePath).size
      console.log(`[SCAN] ═══ SCREENSHOT ═══ ${fileName} (${(fileSize / 1024).toFixed(1)} KB)`)

      // Step 2: Run OCR
      const ocrResult = await runOcr(imagePath, this.sidecarDir)
      console.log('[SCAN] ── RAW OCR LINES ──')
      ocrResult.lines.forEach((line, i) => {
        console.log(`[SCAN]   [${i}] "${line.text}"`)
      })

      // Step 3: Parse into structured gear piece
      const lineTexts = ocrResult.lines.map((l) => l.text)
      const scannedItem = parseTooltip(lineTexts)
      console.log('[SCAN] ── PARSED ITEM ──')
      console.log(`[SCAN]   Name:       ${scannedItem.itemName}`)
      console.log(`[SCAN]   Slot:       ${scannedItem.slot}`)
      console.log(`[SCAN]   Type:       ${scannedItem.itemType}`)
      console.log(`[SCAN]   Item Power: ${scannedItem.itemPower}`)
      console.log(
        `[SCAN]   Affixes:    ${scannedItem.affixes.length} regular, ${scannedItem.temperedAffixes.length} tempered, ${scannedItem.greaterAffixes.length} greater`
      )
      console.log(`[SCAN]   Sockets:    ${scannedItem.sockets}`)

      // Normalize OCR slot → canonical build slot (e.g. "Sword" → "Weapon")
      const canonicalSlot = normalizeSlot(scannedItem.slot)
      console.log(`[SCAN]   Canonical:  ${scannedItem.slot} → ${canonicalSlot}`)

      // Step 4: Mode-specific logic
      if (this.scanMode === 'equip') {
        // equippedStore.equip() handles normalization + ring disambiguation internally
        this.equippedStore.equip(scannedItem)
        // Read back the ACTUAL stored slot key so Ring 1/Ring 2 disambiguation is
        // reflected in the equippedItem returned to the renderer (App state key must match).
        const storedItem = this.equippedStore.getEquipped(canonicalSlot)
          ?? this.equippedStore.getEquipped('Ring 1')
          ?? this.equippedStore.getEquipped('Ring 2')
        const actualSlot = storedItem?.slot ?? canonicalSlot
        console.log(`[SCAN] ── EQUIP MODE ── Stored as equipped: ${actualSlot}`)
        return {
          mode: 'equip',
          verdict: null,
          equippedItem: { ...scannedItem, slot: actualSlot },
          error: null
        }
      }

      // Compare mode: need a build loaded
      if (!buildData) {
        console.log('[SCAN] ── ERROR ── No build loaded')
        return {
          mode: 'compare',
          verdict: null,
          equippedItem: null,
          error: 'Load a build first before scanning'
        }
      }

      // Find matching build slot using canonical name.
      // For "Ring", try both "Ring 1" and "Ring 2".
      let buildSlot = buildData.gearSlots.find(
        (gs) => gs.slot.toLowerCase() === canonicalSlot.toLowerCase()
      )
      if (!buildSlot && canonicalSlot === 'Ring') {
        buildSlot = buildData.gearSlots.find(
          (gs) => gs.slot.toLowerCase() === 'ring 1' || gs.slot.toLowerCase() === 'ring 2'
        )
      }

      if (!buildSlot) {
        console.log(
          `[SCAN] ── ERROR ── No build data for slot: ${scannedItem.slot} (canonical: ${canonicalSlot})`
        )
        return {
          mode: 'compare',
          verdict: null,
          equippedItem: null,
          error: `No build data for slot: ${canonicalSlot}`
        }
      }

      // Get currently equipped item for this slot (if any)
      const equipped = this.equippedStore.getEquipped(canonicalSlot)

      // Score it
      const verdict = compareGear(scannedItem, buildSlot, equipped)
      console.log('[SCAN] ── VERDICT ──')
      console.log(
        `[SCAN]   Result:     ${verdict.verdict} (${verdict.buildMatchCount}/${verdict.buildTotalExpected} build affixes matched)`
      )
      console.log(`[SCAN]   Matched:    ${JSON.stringify(verdict.matchedAffixes)}`)
      console.log(`[SCAN]   Missing:    ${JSON.stringify(verdict.missingAffixes)}`)
      if (verdict.equippedComparison) {
        console.log(
          `[SCAN]   vs Equipped: ${verdict.equippedComparison.isUpgrade ? '⬆️ UPGRADE' : '⬇️ NOT UPGRADE'} (equipped: ${verdict.equippedComparison.equippedMatchCount}/${verdict.buildTotalExpected})`
        )
      }
      if (verdict.recommendations.length > 0) {
        verdict.recommendations.forEach((rec) => {
          console.log(
            `[SCAN]   Rec:        ${rec.action.toUpperCase()}: ${rec.removeAffix ? `Reroll "${rec.removeAffix}" →` : ''} "${rec.addAffix}" (${rec.vendor})`
          )
        })
      }

      // Store compare-mode verdict in scan history
      this.scanHistory.addVerdict(verdict)

      // Recording hook — save a snapshot of this scan for offline replay testing
      if (this.recordingEnabled && this.recordingStore) {
        try {
          this.recordingStore.save({
            screenshotPath: imagePath,
            ocrLines: lineTexts,
            parsedItem: scannedItem,
            buildSlot: buildSlot ?? null,
            buildName: buildData?.name ?? null,
            verdict: verdict ?? null,
            perfectibility: null  // Will be populated in Phase 3
          }, imagePath)
          console.log('[SCAN] ── RECORDING SAVED ──')
        } catch (err) {
          console.warn('[SCAN] ── RECORDING FAILED ──', err)
        }
      }

      return { mode: 'compare', verdict, equippedItem: null, error: null }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[SCAN] ── PIPELINE ERROR ── ${message}`)
      return { mode: this.scanMode, verdict: null, equippedItem: null, error: message }
    }
  }
}
