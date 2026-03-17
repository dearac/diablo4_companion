import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'fs'
import type { RawBuildData, SavedBuild, BuildSourceSite } from '../../shared/types'

// ============================================================
// BuildRepository — File-based persistence for saved builds
// ============================================================
// Each build is stored as a JSON file in data/builds/{id}.json.
// The ID is derived from the import timestamp + sanitized name.
// ============================================================

export class BuildRepository {
  /** The directory where build JSON files are stored */
  private buildsDir: string

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
   * Saves a scraped build to disk.
   *
   * @param data - The raw build data from the scraper
   * @param sourceUrl - The URL the build was imported from
   * @param sourceSite - Which site it came from
   * @returns The saved build with its generated ID
   */
  save(data: RawBuildData, sourceUrl: string, sourceSite: BuildSourceSite): SavedBuild {
    const id = this.generateId(data.name)
    const saved: SavedBuild = {
      id,
      sourceUrl,
      sourceSite,
      importedAt: new Date().toISOString(),
      data
    }

    const filePath = join(this.buildsDir, `${id}.json`)
    writeFileSync(filePath, JSON.stringify(saved, null, 2), 'utf-8')
    return saved
  }

  /**
   * Lists all saved builds, sorted newest first.
   * Reads every .json file in the builds directory.
   */
  listAll(): SavedBuild[] {
    if (!existsSync(this.buildsDir)) return []

    const files = readdirSync(this.buildsDir).filter((f) => f.endsWith('.json'))
    const builds: SavedBuild[] = []

    for (const file of files) {
      try {
        const content = readFileSync(join(this.buildsDir, file), 'utf-8')
        builds.push(JSON.parse(content) as SavedBuild)
      } catch {
        // Skip corrupt files silently
        console.warn(`Skipping corrupt build file: ${file}`)
      }
    }

    // Sort newest first by importedAt
    builds.sort((a, b) => b.importedAt.localeCompare(a.importedAt))
    return builds
  }

  /**
   * Loads a single build by its ID.
   *
   * @param id - The build ID
   * @returns The saved build, or null if not found
   */
  load(id: string): SavedBuild | null {
    const filePath = join(this.buildsDir, `${id}.json`)
    if (!existsSync(filePath)) return null

    try {
      const content = readFileSync(filePath, 'utf-8')
      return JSON.parse(content) as SavedBuild
    } catch {
      return null
    }
  }

  /**
   * Deletes a saved build by its ID.
   *
   * @param id - The build ID to delete
   * @returns true if the file was deleted, false if it didn't exist
   */
  delete(id: string): boolean {
    const filePath = join(this.buildsDir, `${id}.json`)
    if (!existsSync(filePath)) return false
    unlinkSync(filePath)
    return true
  }
}
