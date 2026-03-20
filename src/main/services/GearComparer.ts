import type {
  ScannedGearPiece,
  IGearSlot,
  IAffix,
  ScanVerdict,
  CraftingRecommendation
} from '../../shared/types'
import { affixMatches } from '../../shared/AffixMatcher'

/**
 * GearComparer is the scoring engine for the scan pipeline.
 *
 * Given a scanned item, the build's expected gear slot, and the
 * currently equipped item (if any), it produces a ScanVerdict with:
 *   - Build match score (how many expected affixes are present)
 *   - Verdict rating (PERFECT / UPGRADE / SIDEGRADE / DOWNGRADE)
 *   - Actionable crafting recommendations (enchant, temper, socket)
 *   - Equipped gear comparison (is this an upgrade?)
 *
 * Key D4 S12 rules:
 *   - Enchanting (Occultist): rerolls ONE existing affix, unlimited rerolls
 *   - Tempering (Blacksmith): ADDS new affixes, infinite via Scrolls of Restoration
 *   - Greater Affixes: drop-only, NEVER suggest rerolling these
 */

/**
 * Counts how many build-expected affixes are present in the scanned item.
 * Returns the matched affix names and unmatched (missing) affix names.
 *
 * Build data often contains duplicate affixes (same name with isGreater: true
 * and false). We deduplicate by name before scoring to avoid inflated counts.
 */
function matchAffixes(
  scannedAffixes: string[],
  buildAffixes: IAffix[]
): { matched: string[]; missing: string[] } {
  // Deduplicate build affixes by name (d4builds stores greater + non-greater entries separately)
  const uniqueNames = [...new Set(buildAffixes.map((a) => a.name))]

  const matched: string[] = []
  const missing: string[] = []

  for (const buildAffixName of uniqueNames) {
    const found = scannedAffixes.some((sa) => affixMatches(sa, buildAffixName))
    if (found) {
      matched.push(buildAffixName)
    } else {
      missing.push(buildAffixName)
    }
  }

  return { matched, missing }
}

/**
 * Identifies scanned affixes that don't match any build-expected affix.
 * These are "extra" affixes — candidates for enchanting away.
 */
function findExtraAffixes(scannedAffixes: string[], buildAffixes: IAffix[]): string[] {
  return scannedAffixes.filter((sa) => {
    return !buildAffixes.some((ba) => affixMatches(sa, ba.name))
  })
}

/**
 * Checks if a scanned affix is a greater affix (protected from reroll).
 *
 * Greater affixes are tracked by their name (e.g., "Thorns") in the
 * greaterAffixes array. We check if the full affix string contains the name.
 */
function isGreaterAffix(scannedAffix: string, greaterAffixes: string[]): boolean {
  return greaterAffixes.some((ga) => scannedAffix.toLowerCase().includes(ga.toLowerCase()))
}

/**
 * Determines the verdict based on match percentage.
 *
 * | Score %  | Verdict    |
 * |----------|------------|
 * | 100%     | PERFECT    |
 * | 90-99%   | UPGRADE    |
 * | 60-89%   | SIDEGRADE  |
 * | < 60%    | DOWNGRADE  |
 */
function determineVerdict(matchPercent: number): ScanVerdict['verdict'] {
  if (matchPercent >= 100) return 'PERFECT'
  if (matchPercent >= 90) return 'UPGRADE'
  if (matchPercent >= 60) return 'SIDEGRADE'
  return 'DOWNGRADE'
}

/**
 * Generates enchant recommendations.
 *
 * Rules:
 *   - Only one affix can be enchanted per item (Occultist)
 *   - Never suggest rerolling a Greater Affix
 *   - Pick the first expendable (extra) non-greater affix
 *   - Suggest the first missing build affix as the target
 */
function generateEnchantRecommendations(
  extraAffixes: string[],
  missingAffixes: string[],
  greaterAffixes: string[]
): CraftingRecommendation[] {
  if (missingAffixes.length === 0) return []

  // Find expendable affixes that are NOT greater
  const expendable = extraAffixes.filter((ea) => !isGreaterAffix(ea, greaterAffixes))

  if (expendable.length === 0) return []

  // Recommend enchanting the first expendable affix → first missing affix
  return [
    {
      action: 'enchant',
      removeAffix: expendable[0],
      addAffix: missingAffixes[0],
      vendor: 'Occultist',
      resultScore: `${missingAffixes.length - 1} remaining missing`
    }
  ]
}

/**
 * Generates temper recommendations.
 *
 * Rules:
 *   - Tempering ADDS new affixes (doesn't replace)
 *   - Check if build expects tempered affixes that aren't present
 *   - Uses fuzzy matching same as regular affixes
 */
function generateTemperRecommendations(
  scannedTemperedAffixes: string[],
  buildTemperedAffixes: IAffix[]
): CraftingRecommendation[] {
  if (buildTemperedAffixes.length === 0) return []

  const recommendations: CraftingRecommendation[] = []

  for (const buildTemper of buildTemperedAffixes) {
    const alreadyHas = scannedTemperedAffixes.some((st) => affixMatches(st, buildTemper.name))

    if (!alreadyHas) {
      recommendations.push({
        action: 'temper',
        removeAffix: null,
        addAffix: buildTemper.name,
        vendor: 'Blacksmith',
        resultScore: 'Temper via manual'
      })
    }
  }

  return recommendations
}

/**
 * Generates socket recommendations.
 *
 * If the item has fewer sockets than the build requires, recommend
 * visiting the Jeweler.
 */
function generateSocketRecommendations(socketDelta: number): CraftingRecommendation[] {
  if (socketDelta >= 0) return []

  const needed = Math.abs(socketDelta)
  return [
    {
      action: 'socket',
      removeAffix: null,
      addAffix: `${needed} socket${needed > 1 ? 's' : ''}`,
      vendor: 'Jeweler',
      resultScore: `Add ${needed} socket${needed > 1 ? 's' : ''}`
    }
  ]
}

/**
 * Compares a scanned gear piece against the build's expected gear slot
 * and the currently equipped item.
 *
 * This is the main entry point for the scoring engine.
 *
 * @param scannedItem - The gear piece just scanned via OCR
 * @param buildSlot - The build's expected gear for this slot
 * @param equippedItem - The currently equipped item in this slot (or null)
 * @returns A ScanVerdict with match scores, verdict, and recommendations
 */
export function compareGear(
  scannedItem: ScannedGearPiece,
  buildSlot: IGearSlot,
  equippedItem: ScannedGearPiece | null
): ScanVerdict {
  // ---- Build match scoring ----
  const { matched, missing } = matchAffixes(scannedItem.affixes, buildSlot.affixes)
  const extraAffixes = findExtraAffixes(scannedItem.affixes, buildSlot.affixes)
  const totalExpected = buildSlot.affixes.length
  const matchPercent = totalExpected > 0 ? (matched.length / totalExpected) * 100 : 100

  // ---- Socket delta ----
  const expectedSockets = buildSlot.socketedGems.length
  const socketDelta = scannedItem.sockets - expectedSockets

  // ---- Verdict ----
  const verdict = determineVerdict(matchPercent)

  // ---- Recommendations ----
  const recommendations: CraftingRecommendation[] = [
    ...generateEnchantRecommendations(extraAffixes, missing, scannedItem.greaterAffixes),
    ...generateTemperRecommendations(scannedItem.temperedAffixes, buildSlot.temperedAffixes),
    ...generateSocketRecommendations(socketDelta)
  ]

  // ---- Equipped comparison ----
  let equippedComparison: ScanVerdict['equippedComparison'] = null
  if (equippedItem) {
    const equippedMatch = matchAffixes(equippedItem.affixes, buildSlot.affixes)
    equippedComparison = {
      equippedMatchCount: equippedMatch.matched.length,
      isUpgrade: matched.length > equippedMatch.matched.length
    }
  }

  return {
    scannedItem,
    buildMatchCount: matched.length,
    buildTotalExpected: totalExpected,
    buildMatchPercent: Math.round(matchPercent * 100) / 100,
    matchedAffixes: matched,
    missingAffixes: missing,
    extraAffixes,
    socketDelta,
    greaterAffixCount: scannedItem.greaterAffixes.length,
    verdict,
    equippedComparison,
    recommendations
  }
}
