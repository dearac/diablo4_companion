import { join } from 'path'
import { existsSync, readFileSync, unlinkSync } from 'fs'
import { writeFile } from 'fs/promises'

/**
 * Cached data for a single paragon board node.
 * Stores everything EXCEPT build-specific allocated status.
 */
export interface CachedNodeData {
  nodeName: string
  nodeType: 'normal' | 'magic' | 'rare' | 'legendary' | 'gate'
  nodeDescription?: string
  row?: number
  col?: number
  iconUrl?: string
  activeIconUrl?: string
  bgUrl?: string
  styleTransform?: string
}

/**
 * The full cache file structure — a map of board names to their
 * cached node arrays. Example:
 *   { "Warbringer": [{ nodeName: "...", ... }, ...] }
 */
interface ParagonCacheFile {
  [boardName: string]: CachedNodeData[]
}

/**
 * ParagonCacheService — Caches paragon board layouts and tooltip
 * descriptions in a local JSON file so the scraper doesn't have
 * to re-hover every tile on repeat visits.
 *
 * The cache lives in the data/classes/ directory, which is already
 * designated for "cached class data (skill tree layouts, paragon boards)."
 *
 * Board data rarely changes — only on game patches. The user can
 * clear the cache via a UI button when a new season/patch drops.
 *
 * PERFORMANCE: Writes are debounced so rapid set() calls during
 * scraping only trigger a single disk write. Loading still uses
 * sync I/O on construction (runs once at startup before UI loads).
 */
export class ParagonCacheService {
  private cacheFilePath: string
  private cache: ParagonCacheFile

  /** Debounce timer for disk writes */
  private writeTimer: ReturnType<typeof setTimeout> | null = null

  /** How long to wait before flushing to disk (ms) */
  private static readonly WRITE_DEBOUNCE_MS = 500

  constructor(classesDir: string) {
    this.cacheFilePath = join(classesDir, 'paragon_cache.json')
    this.cache = this.loadFromDisk()
  }

  /**
   * Check if a board is already cached by name.
   */
  has(boardName: string): boolean {
    return boardName in this.cache
  }

  /**
   * Get cached node data for a board.
   * Returns null if the board isn't cached.
   */
  get(boardName: string): CachedNodeData[] | null {
    return this.cache[boardName] ?? null
  }

  /**
   * Cache node data for a board.
   * Only stores layout + tooltip data — NOT allocated status.
   * Disk write is debounced — multiple rapid set() calls during
   * scraping only trigger ONE write operation.
   */
  set(boardName: string, nodes: CachedNodeData[]): void {
    this.cache[boardName] = nodes
    this.scheduleSave()
  }

  /**
   * Clear all cached board data.
   * Called when the user wants to refresh after a game update.
   */
  clear(): void {
    this.cache = {}
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
      this.writeTimer = null
    }
    if (existsSync(this.cacheFilePath)) {
      unlinkSync(this.cacheFilePath)
    }
  }

  /**
   * Returns the number of cached boards.
   */
  get size(): number {
    return Object.keys(this.cache).length
  }

  /**
   * Load the cache file from disk. Returns empty object if
   * the file doesn't exist or is corrupt.
   *
   * Uses sync I/O because this runs once at startup before
   * the window is shown — async isn't needed here.
   */
  private loadFromDisk(): ParagonCacheFile {
    try {
      if (existsSync(this.cacheFilePath)) {
        const raw = readFileSync(this.cacheFilePath, 'utf-8')
        return JSON.parse(raw) as ParagonCacheFile
      }
    } catch {
      // Corrupt file — start fresh
      console.warn('Paragon cache file is corrupt, starting fresh.')
    }
    return {}
  }

  /**
   * Schedules a debounced async write to disk.
   * If another set() call arrives before the timer fires,
   * it resets the timer — so we batch all rapid updates.
   */
  private scheduleSave(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
    }
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null
      this.saveToDisk()
    }, ParagonCacheService.WRITE_DEBOUNCE_MS)
  }

  /**
   * Persist the current cache state to disk (async — non-blocking).
   */
  private async saveToDisk(): Promise<void> {
    try {
      await writeFile(this.cacheFilePath, JSON.stringify(this.cache, null, 2), 'utf-8')
    } catch (err) {
      console.error('Failed to write paragon cache:', err)
    }
  }
}
