import { readFileSync, writeFileSync, existsSync } from 'fs'
import type { ScannedGearPiece } from '../../shared/types'
import { normalizeSlot } from '../../shared/SlotNormalizer'

/**
 * EquippedGearStore manages the user's currently equipped gear.
 *
 * In Equip Mode, scanned items are saved here by canonical slot name.
 * In Compare Mode, the comparer reads from here to determine
 * if a scanned item is an upgrade over what's currently equipped.
 *
 * Slot normalization:
 *   - OCR "Sword"/"Mace"/etc. → stored as "Weapon"
 *   - OCR "Shield"/"Focus"/"Totem" → stored as "Offhand"
 *   - OCR "Ring" → stored as "Ring 1" (first) or "Ring 2" (second)
 *
 * Data is persisted to data/equipped-gear.json.
 * Pass null as filePath for in-memory-only mode (tests).
 */
export class EquippedGearStore {
  private gear: Record<string, ScannedGearPiece> = {}
  private filePath: string | null

  constructor(filePath: string | null) {
    this.filePath = filePath
    if (filePath && existsSync(filePath)) {
      try {
        this.gear = JSON.parse(readFileSync(filePath, 'utf-8'))
      } catch {
        this.gear = {}
      }
    }
  }

  /**
   * Save a scanned item as the currently equipped gear for its slot.
   * Normalizes OCR slot names to canonical build-data slot names.
   * Handles ring disambiguation: first ring → "Ring 1", second → "Ring 2".
   */
  equip(item: ScannedGearPiece): void {
    const rawSlot = item.slot
    let canonicalSlot = normalizeSlot(rawSlot)

    // Ring disambiguation: if "Ring", assign to "Ring 1" first, then "Ring 2"
    if (canonicalSlot === 'Ring') {
      if (!this.gear['Ring 1']) {
        canonicalSlot = 'Ring 1'
      } else {
        canonicalSlot = 'Ring 2'
      }
    }

    // Update the item's slot to the canonical name before storing
    const normalizedItem: ScannedGearPiece = { ...item, slot: canonicalSlot }
    this.gear[canonicalSlot] = normalizedItem
    this.save()
  }

  /** Get the currently equipped item for a canonical slot, or null if empty. */
  getEquipped(slot: string): ScannedGearPiece | null {
    return this.gear[slot] ?? null
  }

  /** Get all currently equipped gear as a slot→item map. */
  getAllEquipped(): Record<string, ScannedGearPiece> {
    return { ...this.gear }
  }

  /** Clear all equipped gear (start fresh). */
  clearAll(): void {
    this.gear = {}
    this.save()
  }

  /** Persist current state to disk (no-op in test/in-memory mode). */
  private save(): void {
    if (this.filePath) {
      writeFileSync(this.filePath, JSON.stringify(this.gear, null, 2), 'utf-8')
    }
  }
}
