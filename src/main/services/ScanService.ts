import { ScreenCaptureService } from './ScreenCaptureService'
import { runOcr } from './OcrService'
import { parseTooltip } from './GearParser'
import { compareGear } from '../../shared/GearComparer'
import { ScanHistoryStore } from './ScanHistoryStore'
import { ScanRecordingStore } from './ScanRecordingStore'
import { normalizeSlot } from '../../shared/SlotNormalizer'
import type { ScanHistoryEntry } from '../../shared/types'
import type { ScanVerdict, ScannedGearPiece, RawBuildData } from '../../shared/types'
import { statSync } from 'fs'
import { basename } from 'path'

/**
 * ScanService is the orchestrator for the entire scan pipeline.
 *
 * Flow: Hotkey → Screenshot → OCR → Parse → Compare against loaded build
 *
 * Compares scanned gear exclusively against the loaded build to produce
 * a ScanVerdict with match scores and crafting recommendations.
 */
export class ScanService {
  private captureService: ScreenCaptureService
  private scanHistory: ScanHistoryStore
  private sidecarDir: string
  private recordingStore: ScanRecordingStore | null = null
  private recordingEnabled = false

  constructor(
    captureService: ScreenCaptureService,
    scanHistory: ScanHistoryStore,
    sidecarDir: string,
    recordingStore?: ScanRecordingStore
  ) {
    this.captureService = captureService
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
    updatedItem: ScannedGearPiece
  ): boolean {
    return this.scanHistory.updateEntry(scannedAt, updatedItem)
  }

  /**
   * Executes the full scan pipeline.
   *
   * @param buildData - The currently loaded build (needed for comparison)
   * @returns A ScanVerdict or error
   */
  async scan(buildData: RawBuildData | null): Promise<{
    verdict: ScanVerdict | null
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

      // Step 4: Compare against build
      if (!buildData) {
        console.log('[SCAN] ── ERROR ── No build loaded')
        return {
          verdict: null,
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
          verdict: null,
          error: `No build data for slot: ${canonicalSlot}`
        }
      }

      // Score it
      const verdict = compareGear(scannedItem, buildSlot)
      console.log('[SCAN] ── VERDICT ──')
      console.log(
        `[SCAN]   Result:     ${verdict.verdict} (${verdict.buildMatchCount}/${verdict.buildTotalExpected} build affixes matched)`
      )
      console.log(`[SCAN]   Matched:    ${JSON.stringify(verdict.matchedAffixes)}`)
      console.log(`[SCAN]   Missing:    ${JSON.stringify(verdict.missingAffixes)}`)
      if (verdict.recommendations.length > 0) {
        verdict.recommendations.forEach((rec) => {
          console.log(
            `[SCAN]   Rec:        ${rec.action.toUpperCase()}: ${rec.removeAffix ? `Reroll "${rec.removeAffix}" →` : ''} "${rec.addAffix}" (${rec.vendor})`
          )
        })
      }

      // Store verdict in scan history
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

      return { verdict, error: null }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[SCAN] ── PIPELINE ERROR ── ${message}`)
      return { verdict: null, error: message }
    }
  }
}
