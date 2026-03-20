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
  | 'Paladin'
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
  boardRotation?: number // e.g. 0, 90, 180, 270
  boardBgUrl?: string // URL for the board's background image
  boardX?: number // CSS left position from d4builds (multiples of 1258)
  boardY?: number // CSS top position from d4builds (multiples of 1258)
}

/**
 * A single node on a paragon board.
 */
export interface IParagonNode {
  nodeName: string
  nodeType: 'normal' | 'magic' | 'rare' | 'legendary' | 'gate'
  allocated: boolean
  nodeDescription?: string // Stat text from tooltip, e.g. "+5 Willpower"
  row?: number
  col?: number
  iconUrl?: string // Custom icon URL from the site
  activeIconUrl?: string // The glowing active version
  bgUrl?: string // The tile background (common, rare, etc)
  styleTransform?: string // e.g. "rotate(-90deg)"
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
  requiredAspect: IAspectInfo | null
  affixes: IAffix[]
  implicitAffixes: IAffix[]
  temperedAffixes: IAffix[]
  greaterAffixes: IAffix[]
  masterworkPriority: string[]
  rampageEffect: string | null
  feastEffect: string | null
  socketedGems: string[]
}

/**
 * A stat affix on a piece of gear.
 */
export interface IAffix {
  name: string
  isGreater: boolean
}

/**
 * Aspect/runeword data from gear tooltip.
 */
export interface IAspectInfo {
  name: string
  description: string | null
}

/**
 * An active rune in the build (from the "Active Runes" section).
 * Runes come in pairs: a Ritual rune (offering gain) and a
 * Ritual/Invocation rune (offering spend), plus additional runes.
 */
export interface IRune {
  name: string
  runeType: string // e.g. "Legendary Rune of Ritual", "Rare Rune of Invocation"
  effects: string[] // e.g. ["Gain: 25 Offering", "Stores offering every 0.3 seconds..."]
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
  activeRunes: IRune[]
}

/**
 * A build that has been saved to disk.
 * Wraps RawBuildData with persistence metadata (ID, source URL, timestamps).
 */
export interface SavedBuild {
  /** Unique identifier (ISO timestamp + sanitized name) */
  id: string
  /** The URL the build was originally imported from */
  sourceUrl: string
  /** Which site it came from */
  sourceSite: BuildSourceSite
  /** When the build was first imported (ISO string) */
  importedAt: string
  /** The raw build data from the scraper */
  data: RawBuildData
}

// ============================================================
// SCANNED GEAR — OCR scan results and comparison verdicts
// ============================================================

/** A piece of gear read from a tooltip by the OCR scanner. */
export interface ScannedGearPiece {
  slot: string
  itemName: string
  itemType: 'Unique' | 'Legendary' | 'Rare'
  itemPower: number
  affixes: string[]
  implicitAffixes: string[]
  temperedAffixes: string[]
  greaterAffixes: string[]
  sockets: number
  socketContents: string[]
  aspect: { name: string; description: string } | null
  rawText: string
}

/** The mode the scanner is operating in. */
export type ScanMode = 'compare' | 'equip'

/** A recommendation for how to improve an item. */
export interface CraftingRecommendation {
  action: 'enchant' | 'temper' | 'socket' | 'none'
  removeAffix: string | null
  addAffix: string
  vendor: string
  resultScore: string
}

/** The result of comparing a scanned item to the build + equipped gear. */
export interface ScanVerdict {
  scannedItem: ScannedGearPiece
  buildMatchCount: number
  buildTotalExpected: number
  buildMatchPercent: number
  matchedAffixes: string[]
  missingAffixes: string[]
  extraAffixes: string[]
  socketDelta: number
  greaterAffixCount: number
  verdict: 'PERFECT' | 'UPGRADE' | 'SIDEGRADE' | 'DOWNGRADE'
  equippedComparison: {
    equippedMatchCount: number
    isUpgrade: boolean
  } | null
  recommendations: CraftingRecommendation[]
}

