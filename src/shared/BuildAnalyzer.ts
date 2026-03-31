import { compareGear } from './GearComparer'
import type {
  ScannedGearPiece,
  IGearSlot,
  CraftingRecommendation,
  ScanVerdict
} from './types'

/**
 * Per-slot analysis breakdown.
 */
export interface SlotAnalysis {
  slot: string
  matchPercent: number
  matchCount: number
  totalExpected: number
  verdict: ScanVerdict['verdict'] | 'EMPTY'
  topAction: CraftingRecommendation | null
  allActions: CraftingRecommendation[]
}

/**
 * A crafting recommendation annotated with which slot it applies to.
 */
export interface SlottedRecommendation extends CraftingRecommendation {
  slot: string
}

/**
 * Global build analysis across all equipped gear.
 */
export interface BuildAnalysis {
  overallPercent: number
  slotBreakdown: SlotAnalysis[]
  globalActionQueue: SlottedRecommendation[]
}

/**
 * Computes a global gap analysis across all equipped gear vs build requirements.
 *
 * @param equippedGear - Map of slot name to scanned gear piece
 * @param buildSlots - Array of build gear slot requirements
 * @returns BuildAnalysis with overall %, per-slot breakdown, and global action queue
 */
export function computeBuildAnalysis(
  equippedGear: Record<string, ScannedGearPiece>,
  buildSlots: IGearSlot[]
): BuildAnalysis {
  const slotBreakdown: SlotAnalysis[] = []
  const globalActionQueue: SlottedRecommendation[] = []

  for (const buildSlot of buildSlots) {
    const equipped = equippedGear[buildSlot.slot] ?? null

    if (!equipped) {
      // Deduplicate build affix count the same way GearComparer does
      const allBuildAffixNames = [
        ...buildSlot.affixes.map((a) => a.name),
        ...buildSlot.temperedAffixes.map((a) => a.name),
        ...buildSlot.greaterAffixes.map((a) => a.name)
      ]
      const uniqueCount = new Set(allBuildAffixNames).size

      slotBreakdown.push({
        slot: buildSlot.slot,
        matchPercent: 0,
        matchCount: 0,
        totalExpected: uniqueCount,
        verdict: 'EMPTY',
        topAction: null,
        allActions: []
      })
      continue
    }

    const verdict = compareGear(equipped, buildSlot)

    const slotActions = verdict.recommendations
    slotBreakdown.push({
      slot: buildSlot.slot,
      matchPercent: verdict.buildMatchPercent,
      matchCount: verdict.buildMatchCount,
      totalExpected: verdict.buildTotalExpected,
      verdict: verdict.verdict,
      topAction: slotActions.length > 0 ? slotActions[0] : null,
      allActions: slotActions
    })

    // Add slot-annotated actions to global queue
    for (const action of slotActions) {
      globalActionQueue.push({ ...action, slot: buildSlot.slot })
    }
  }

  // Sort slots: weakest first
  slotBreakdown.sort((a, b) => a.matchPercent - b.matchPercent)

  // Sort global actions: highest priority first
  globalActionQueue.sort((a, b) => b.priority - a.priority)

  // Compute overall % (average of all slot percentages, including empty = 0%)
  const totalPercent = slotBreakdown.reduce((sum, s) => sum + s.matchPercent, 0)
  const overallPercent =
    slotBreakdown.length > 0 ? Math.round(totalPercent / slotBreakdown.length) : 0

  return { overallPercent, slotBreakdown, globalActionQueue }
}
