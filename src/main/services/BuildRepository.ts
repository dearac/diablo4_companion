import { join } from 'path'
import { existsSync } from 'fs'
import { readFile, writeFile, readdir, unlink } from 'fs/promises'
import type {
  RawBuildData,
  SavedBuild,
  BuildSourceSite,
  IGearSlot,
  IAspectInfo
} from '../../shared/types'

// ============================================================
// BuildRepository — File-based persistence for saved builds
// ============================================================
// Each build is stored as a JSON file in data/builds/{id}.json.
// The ID is derived from the import timestamp + sanitized name.
//
// PERFORMANCE: All file I/O is async to avoid blocking the main
// process event loop. The listAll() method uses a metadata cache
// to avoid re-reading every file on each call.
// ============================================================

/** Lightweight summary returned by listAll() to minimize IPC payload size */
interface BuildListCache {
  builds: SavedBuild[]
  /** Set of filenames already loaded — skip re-reading them */
  loadedFiles: Set<string>
}

export class BuildRepository {
  /** The directory where build JSON files are stored */
  private buildsDir: string

  /** In-memory cache of all builds — avoids re-reading files */
  private listCache: BuildListCache | null = null

  constructor(buildsDir: string) {
    this.buildsDir = buildsDir
  }

  /**
   * Generates a unique ID from the build name and current timestamp.
   * Format: "2026-03-16T23-00-00-000Z_blessed-shield-paladin"
   */
  private generateId(name: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)
    return `${timestamp}_${slug}`
  }

  /**
   * Saves a scraped build to disk (async — doesn't block main).
   *
   * @param data - The raw build data from the scraper
   * @param sourceUrl - The URL the build was imported from
   * @param sourceSite - Which site it came from
   * @returns The saved build with its generated ID
   */
  async save(
    data: RawBuildData,
    sourceUrl: string,
    sourceSite: BuildSourceSite
  ): Promise<SavedBuild> {
    const id = this.generateId(data.name)
    const saved: SavedBuild = {
      id,
      sourceUrl,
      sourceSite,
      importedAt: new Date().toISOString(),
      data
    }

    const filePath = join(this.buildsDir, `${id}.json`)
    await writeFile(filePath, JSON.stringify(saved, null, 2), 'utf-8')

    // Invalidate list cache so next listAll() picks up the new file
    this.listCache = null

    return saved
  }

  /**
   * Lists all saved builds, sorted newest first.
   * Uses an in-memory cache to avoid re-reading every file on each IPC call.
   * The cache is invalidated on save/delete operations.
   */
  async listAll(): Promise<SavedBuild[]> {
    if (!existsSync(this.buildsDir)) return []

    // Return cached result if available
    if (this.listCache) return this.listCache.builds

    const files = (await readdir(this.buildsDir)).filter((f) => f.endsWith('.json'))
    const builds: SavedBuild[] = []

    // Read all files concurrently for speed
    const readPromises = files.map(async (file) => {
      try {
        const content = await readFile(join(this.buildsDir, file), 'utf-8')
        const build = JSON.parse(content) as SavedBuild
        this.migrateGearSlots(build)
        return build
      } catch {
        // Skip corrupt files silently
        console.warn(`Skipping corrupt build file: ${file}`)
        return null
      }
    })

    const results = await Promise.all(readPromises)
    for (const build of results) {
      if (build) builds.push(build)
    }

    // Sort newest first by importedAt
    builds.sort((a, b) => b.importedAt.localeCompare(a.importedAt))

    // Cache the result
    this.listCache = {
      builds,
      loadedFiles: new Set(files)
    }

    return builds
  }

  /**
   * Loads a single build by its ID (async).
   *
   * @param id - The build ID
   * @returns The saved build, or null if not found
   */
  async load(id: string): Promise<SavedBuild | null> {
    const filePath = join(this.buildsDir, `${id}.json`)
    if (!existsSync(filePath)) return null

    try {
      const content = await readFile(filePath, 'utf-8')
      const build = JSON.parse(content) as SavedBuild
      this.migrateGearSlots(build)
      return build
    } catch {
      return null
    }
  }

  /**
   * Migrates old gear slot data to the new shape.
   * Old builds have: priorityAffixes, temperingTargets, requiredAspect (string)
   * New builds have: affixes, implicitAffixes, temperedAffixes, greaterAffixes,
   *                  requiredAspect (IAspectInfo), rampageEffect, feastEffect
   */
  private migrateGearSlots(build: SavedBuild): void {
    if (!build.data?.gearSlots) return

    // Ensure activeRunes exists (old builds won't have it)
    if (!build.data.activeRunes) {
      build.data.activeRunes = []
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    build.data.gearSlots = (build.data.gearSlots as any[])
      // Filter out rune items that were incorrectly scraped as gear
      .filter((slot) => slot.slot !== 'Unknown Slot')
      .map((slot): IGearSlot => {
        // If slot already has the new shape, return as-is
        if (Array.isArray(slot.affixes)) return slot as IGearSlot

        // Migrate from old shape
        const aspect: IAspectInfo | null =
          typeof slot.requiredAspect === 'string' && slot.requiredAspect
            ? { name: slot.requiredAspect, description: null }
            : slot.requiredAspect && typeof slot.requiredAspect === 'object'
              ? slot.requiredAspect
              : null

        return {
          slot: slot.slot || 'Unknown',
          itemName: slot.itemName || null,
          itemType: slot.itemType || 'Legendary',
          requiredAspect: aspect,
          affixes: (slot.priorityAffixes || []).map(
            (a: { name: string; priority?: number }) => ({
              name: a.name,
              isGreater: false
            })
          ),
          implicitAffixes: [],
          temperedAffixes: (slot.temperingTargets || []).map((t: string) => ({
            name: t,
            isGreater: false
          })),
          greaterAffixes: [],
          masterworkPriority: slot.masterworkPriority || [],
          rampageEffect: null,
          feastEffect: null,
          socketedGems: slot.socketedGems || []
        }
      })
  }

  /**
   * Deletes a saved build by its ID (async).
   *
   * @param id - The build ID to delete
   * @returns true if the file was deleted, false if it didn't exist
   */
  async delete(id: string): Promise<boolean> {
    const filePath = join(this.buildsDir, `${id}.json`)
    if (!existsSync(filePath)) return false
    await unlink(filePath)

    // Invalidate cache
    this.listCache = null

    return true
  }
}
