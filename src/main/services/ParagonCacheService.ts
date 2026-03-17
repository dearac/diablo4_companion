import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'

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
 */
export class ParagonCacheService {
  private cacheFilePath: string
  private cache: ParagonCacheFile

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
   */
  set(boardName: string, nodes: CachedNodeData[]): void {
    this.cache[boardName] = nodes
    this.saveToDisk()
  }

  /**
   * Clear all cached board data.
   * Called when the user wants to refresh after a game update.
   */
  clear(): void {
    this.cache = {}
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
   * Persist the current cache state to disk.
   */
  private saveToDisk(): void {
    writeFileSync(this.cacheFilePath, JSON.stringify(this.cache, null, 2), 'utf-8')
  }
}
