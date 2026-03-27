import { readFileSync, writeFileSync, existsSync } from 'fs'
import type { ScanVerdict } from '../../shared/types'

/**
 * A timestamped scan verdict in the scan history.
 */
export interface ScanHistoryEntry {
  verdict: ScanVerdict
  scannedAt: number // Date.now() timestamp
}

const EXPIRY_MS = 15 * 60 * 1000 // 15 minutes

/**
 * ScanHistoryStore accumulates compare-mode scan verdicts.
 *
 * Entries persist until manually cleared or auto-pruned after 15 minutes.
 * Pass null as filePath for in-memory-only mode (tests).
 */
export class ScanHistoryStore {
  private entries: ScanHistoryEntry[] = []
  private filePath: string | null

  constructor(filePath: string | null) {
    this.filePath = filePath
    if (filePath && existsSync(filePath)) {
      try {
        this.entries = JSON.parse(readFileSync(filePath, 'utf-8'))
      } catch {
        this.entries = []
      }
    }
  }

  /** Add a compare-mode verdict to history. Newest first. */
  addVerdict(verdict: ScanVerdict): void {
    this.entries.unshift({ verdict, scannedAt: Date.now() })
    this.save()
  }

  /** Get all entries, auto-pruning expired ones first. Newest first. */
  getAll(): ScanHistoryEntry[] {
    const now = Date.now()
    this.entries = this.entries.filter((e) => now - e.scannedAt < EXPIRY_MS)
    return this.entries
  }

  /** Clear all entries. */
  clearAll(): void {
    this.entries = []
    this.save()
  }

  /**
   * Update an existing entry's scannedItem in-place.
   *
   * Used by the Scan Tab's inline affix tag editor so the user can
   * reclassify affixes and re-run the perfectibility pipeline without
   * re-scanning the item.
   *
   * @param scannedAt - The Date.now() timestamp key that uniquely identifies the entry
   * @param updatedItem - The updated ScannedGearPiece to replace the original
   * @returns true if an entry was found and updated, false otherwise
   */
  updateEntry(
    scannedAt: number,
    updatedItem: import('../../shared/types').ScannedGearPiece
  ): boolean {
    const entry = this.entries.find((e) => e.scannedAt === scannedAt)
    if (!entry) return false
    entry.verdict.scannedItem = updatedItem
    this.save()
    return true
  }

  /** Get count of non-expired entries. */
  count(): number {
    return this.getAll().length
  }

  /**
   * Returns a direct reference to the internal entries array.
   * Intended for test-only use (e.g., backdating timestamps).
   */
  getRawEntries(): ScanHistoryEntry[] {
    return this.entries
  }

  /** Persist current state to disk (no-op in test/in-memory mode). */
  private save(): void {
    if (this.filePath) {
      writeFileSync(this.filePath, JSON.stringify(this.entries, null, 2), 'utf-8')
    }
  }
}
