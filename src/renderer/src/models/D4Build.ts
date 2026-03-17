import type {
  ID4Build,
  ISkillAllocation,
  IParagonBoard,
  IGearSlot,
  D4Class,
  BuildSourceSite
} from '../../../shared/types'

// ============================================================
// D4Build — The main data class for a Diablo 4 build
// ============================================================
// This class represents a complete build that was imported from
// a website like maxroll.gg, d4builds.gg, or icy-veins.com.
// It stores everything: which class, which skills to use, how
// to set up the paragon board, and what gear to equip.
// ============================================================

/** How to create a new D4Build */
export interface D4BuildCreateParams {
  name: string
  sourceUrl: string
  sourceSite: BuildSourceSite
  d4Class: D4Class
  level: number
}

/** The list of all valid source sites */
const VALID_SOURCES: BuildSourceSite[] = ['d4builds', 'maxroll', 'icy-veins']

/** The list of all valid Diablo 4 classes */
const VALID_CLASSES: D4Class[] = [
  'Barbarian',
  'Druid',
  'Necromancer',
  'Rogue',
  'Sorcerer',
  'Spiritborn',
  'Witch Doctor'
]

/**
 * Represents a complete Diablo 4 character build.
 *
 * Created when a user imports a build from one of the supported websites.
 * Contains all the information needed to display the build planner
 * and compare gear against the build's requirements.
 */
export class D4Build implements ID4Build {
  /** Unique identifier for this build (auto-generated) */
  readonly id: string

  /** The name of the build (e.g., "Bash Barbarian") */
  name: string

  /** The URL we imported this build from */
  sourceUrl: string

  /** Which website this build came from */
  sourceSite: BuildSourceSite

  /** Which Diablo 4 class this build is for */
  d4Class: D4Class

  /** The character level this build is designed for */
  level: number

  /** All skills allocated in this build (starts empty, filled during import) */
  skills: ISkillAllocation[]

  /** All paragon boards in this build (starts empty, filled during import) */
  paragonBoards: IParagonBoard[]

  /** All gear slots with their requirements (starts empty, filled during import) */
  gearSlots: IGearSlot[]

  /** When this build was imported (ISO date string) */
  importedAt: string

  /**
   * Creates a new D4Build.
   *
   * @param params - The required fields to create a build
   * @throws Error if the source site or class isn't valid
   */
  constructor(params: D4BuildCreateParams) {
    // Validate the source site — must be one of our supported sites
    if (!VALID_SOURCES.includes(params.sourceSite)) {
      throw new Error(
        `Invalid source site "${params.sourceSite}". ` +
        `Must be one of: ${VALID_SOURCES.join(', ')}`
      )
    }

    // Validate the class — must be a real D4 class
    if (!VALID_CLASSES.includes(params.d4Class)) {
      throw new Error(
        `Invalid class "${params.d4Class}". ` +
        `Must be one of: ${VALID_CLASSES.join(', ')}`
      )
    }

    this.id = this.generateId()
    this.name = params.name
    this.sourceUrl = params.sourceUrl
    this.sourceSite = params.sourceSite
    this.d4Class = params.d4Class
    this.level = params.level
    this.skills = []
    this.paragonBoards = []
    this.gearSlots = []
    this.importedAt = new Date().toISOString()
  }

  /**
   * Generates a unique ID for the build using a simple random string.
   * Good enough for local storage — we don't need UUID complexity.
   */
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 10)
  }
}
