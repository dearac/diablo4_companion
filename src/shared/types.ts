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

/** A recommendation for how to improve an item. */
export interface CraftingRecommendation {
  action: 'enchant' | 'temper' | 'socket' | 'aspect' | 'none'
  removeAffix: string | null
  addAffix: string
  vendor: string
  resultScore: string
  priority: number
}

/** The result of comparing a scanned item to the loaded build. */
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
  aspectComparison: {
    expectedAspect: string
    hasMatch: boolean
  } | null
  recommendations: CraftingRecommendation[]
}

/** A timestamped scan verdict in the scan history. */
export interface ScanHistoryEntry {
  verdict: ScanVerdict
  scannedAt: number // Date.now() timestamp
}

/** The category of an affix on a piece of gear. */
export type AffixType = 'regular' | 'tempered' | 'greater' | 'implicit'

// ============================================================
// PERFECTIBILITY — S12 gear evaluation pipeline results
// ============================================================

/** Perfectibility verdict for a scanned gear piece. */
export type PerfectibilityVerdict = 'PERFECTIBLE' | 'RISKY' | 'NOT_PERFECTIBLE'

/** Result of one evaluation step in the perfectibility pipeline. */
export interface PerfectibilityStep {
  name: string
  passed: boolean
  skipped: boolean
  reason: string
  action: string | null
}

/** Full result from the 4-step perfectibility pipeline. */
export interface PerfectibilityResult {
  overallVerdict: PerfectibilityVerdict
  overallReason: string
  steps: {
    bloodied: PerfectibilityStep
    baseAffixes: PerfectibilityStep & {
      matchCount: number
      totalBase: number
      rerollTarget: string | null
      rerollReplacement: string | null
    }
    greaterAffixes: PerfectibilityStep & { missingGA: string[] }
    tempering: PerfectibilityStep & { missingTempers: string[] }
  }
}

// ============================================================
// AFFIX NORMALIZATION — Canonical matching system
// ============================================================

/** How a canonical name was resolved during normalization. */
export type MatchMethod = 'exact' | 'alias' | 'fuzzy' | 'unresolved'

/** A raw affix string normalized into structured data. */
export interface NormalizedAffix {
  /** The original string before normalization */
  raw: string
  /** The clean extracted stat name string before resolving */
  parsedName: string
  /** The resolved canonical stat name, or null if unresolvable */
  canonicalName: string | null
  /** Extracted numeric value, null if unparseable */
  value: number | null
  /** Whether the value is a percentage */
  isPercent: boolean
  /** Min/max range if present (e.g., [88, 102]) */
  range: [number, number] | null
  /** Confidence: 1.0 = exact, 0.9 = alias, 0.5-0.8 = fuzzy */
  confidence: number
  /** Which strategy resolved the canonical name */
  matchMethod: MatchMethod
}

/** The result of comparing two NormalizedAffix values. */
export interface AffixMatchResult {
  /** Whether this is considered a match */
  matched: boolean
  /** Confidence score: 1.0 = exact, lower = weaker */
  confidence: number
  /** Human-readable explanation */
  reason: string
  /** The canonical name both sides resolved to (if matched) */
  canonicalName: string | null
  /** How the match was determined */
  method: MatchMethod
}

/** How a scanned affix's value compares to the possible roll range. */
export type RollQuality = 'unknown' | 'low' | 'mid' | 'high' | 'max'

/** Extended affix data with roll quality assessment. */
export interface AffixAssessment {
  normalized: NormalizedAffix
  rollQuality: RollQuality
  rollPercentile: number | null
}

/** Enhanced step result with match details. */
export interface EnhancedPerfectibilityStep extends PerfectibilityStep {
  matchDetails: AffixMatchResult[]
}

// ============================================================
// SCAN RECORDINGS — Live scan capture for offline testing
// ============================================================

/** A complete snapshot of one scan for replay/testing. */
export interface ScanRecording {
  id: string
  timestamp: string
  screenshotPath: string
  ocrLines: string[]
  parsedItem: ScannedGearPiece
  buildSlot: IGearSlot | null
  buildName: string | null
  verdict: ScanVerdict | null
  perfectibility: PerfectibilityResult | null
}

/** Result of replaying a saved scan through the current pipeline. */
export interface ReplayResult {
  recording: ScanRecording
  reparsedItem: ScannedGearPiece
  newVerdict: ScanVerdict | null
  diffs: string[]
}
