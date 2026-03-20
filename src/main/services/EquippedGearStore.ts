import { readFileSync, writeFileSync, existsSync } from 'fs'
import type { ScannedGearPiece } from '../../shared/types'

/**
 * EquippedGearStore manages the user's currently equipped gear.
 *
 * In Equip Mode, scanned items are saved here by slot.
 * In Compare Mode, the comparer reads from here to determine
 * if a scanned item is an upgrade over what's currently equipped.
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

  /** Save a scanned item as the currently equipped gear for its slot. */
  equip(item: ScannedGearPiece): void {
    this.gear[item.slot] = item
    this.save()
  }

  /** Get the currently equipped item for a slot, or null if empty. */
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
