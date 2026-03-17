// ============================================================
// SHARED TYPES — Used by both Main and Renderer processes
// ============================================================
// These types define the "language" that the main process and
// the React UI use to talk to each other. Every piece of data
// that crosses the IPC bridge uses these types.
// ============================================================

/**
 * All seven classes in Diablo 4.
 * We use this to identify which class a build belongs to.
 */
export type D4Class =
  | 'Barbarian'
  | 'Druid'
  | 'Necromancer'
  | 'Rogue'
  | 'Sorcerer'
  | 'Spiritborn'
  | 'Witch Doctor'

/**
 * The three build websites we can import from.
 */
export type BuildSourceSite = 'd4builds' | 'maxroll' | 'icy-veins'

/**
 * Represents a complete D4 build — everything we know about
 * how a player should set up their character.
 */
export interface ID4Build {
  id: string
  name: string
  sourceUrl: string
  sourceSite: BuildSourceSite
  d4Class: D4Class
  level: number
  skills: ISkillAllocation[]
  paragonBoards: IParagonBoard[]
  gearSlots: IGearSlot[]
  importedAt: string // ISO date string
}

/**
 * One skill that the build uses, with how many points are allocated.
 */
export interface ISkillAllocation {
  skillName: string
  points: number
  maxPoints: number
  tier: string
  nodeType: 'active' | 'passive' | 'keystone'
}

/**
 * A single paragon board in the build.
 */
export interface IParagonBoard {
  boardName: string
  boardIndex: number
  glyph: IGlyphInfo | null
  allocatedNodes: IParagonNode[]
}

/**
 * A single node on a paragon board.
 */
export interface IParagonNode {
  nodeName: string
  nodeType: 'normal' | 'magic' | 'rare' | 'legendary'
  allocated: boolean
}

/**
 * A glyph placed into a paragon board.
 */
export interface IGlyphInfo {
  glyphName: string
  level: number
}

/**
 * What the build requires in a specific gear slot.
 */
export interface IGearSlot {
  slot: string
  itemName: string | null
  itemType: 'Unique' | 'Legendary' | 'Rare'
  requiredAspect: string | null
  priorityAffixes: IAffix[]
  temperingTargets: string[]
  masterworkPriority: string[]
}

/**
 * A stat affix on a piece of gear, with its priority.
 */
export interface IAffix {
  name: string
  priority: number
}

/**
 * The scoring result for one piece of gear.
 */
export interface IGearVerdict {
  slot: string
  overallRating: 'PERFECT' | 'GOOD' | 'CLOSE' | 'WRONG'
  overallScore: number
  details: IVerdictDetail[]
}

/**
 * One line item in a gear verdict breakdown.
 */
export interface IVerdictDetail {
  category: string
  expected: string
  found: string
  matched: boolean
  advice: string
}

/**
 * Raw data scraped from a build website before normalization.
 * Each scraper fills this in differently, but the structure is the same.
 */
export interface RawBuildData {
  name: string
  d4Class: string
  level: number
  skills: ISkillAllocation[]
  paragonBoards: IParagonBoard[]
  gearSlots: IGearSlot[]
}
