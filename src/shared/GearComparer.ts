import type {
  ScannedGearPiece,
  IGearSlot,
  IAffix,
  ScanVerdict,
  CraftingRecommendation
} from './types'
import { affixMatches, aspectMatches } from './AffixMatcher'

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

import { normalizeAffix } from './AffixNormalizer'

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
    const cleanName = normalizeAffix(buildAffixName).parsedName || buildAffixName
    if (found) {
      matched.push(cleanName)
    } else {
      missing.push(cleanName)
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
  const cleanRemove = normalizeAffix(expendable[0]).parsedName || expendable[0]
  const cleanAdd = missingAffixes[0] // this was already normalized in matchAffixes!

  return [
    {
      action: 'enchant',
      removeAffix: cleanRemove,
      addAffix: cleanAdd,
      vendor: 'Occultist',
      resultScore: `${missingAffixes.length - 1} remaining missing`,
      priority: 100
    }
  ]
}

/**
 * Generates temper recommendations.
 *
 * Rules:
 *   - Tempering ADDS new affixes (doesn't replace)
 *   - Check if build expects tempered affixes that aren't present
 *     in ANY of the scanned item's affix pools (since OCR cannot distinguish
 *     tempered from regular affixes in the tooltip — they look identical)
 *   - Uses fuzzy matching same as regular affixes
 */
function generateTemperRecommendations(
  allScannedAffixes: string[],
  buildTemperedAffixes: IAffix[]
): CraftingRecommendation[] {
  if (buildTemperedAffixes.length === 0) return []

  // Deduplicate by name (build data stores greater + non-greater variants)
  const uniqueTemperNames = [...new Set(buildTemperedAffixes.map((a) => a.name))]
  const recommendations: CraftingRecommendation[] = []

  for (const temperName of uniqueTemperNames) {
    // Check the full scanned pool — OCR puts all affixes in scannedItem.affixes[]
    // regardless of whether they are tempered or regular in-game
    const alreadyHas = allScannedAffixes.some((st) => affixMatches(st, temperName))

    if (!alreadyHas) {
      const cleanName = normalizeAffix(temperName).parsedName || temperName
      recommendations.push({
        action: 'temper',
        removeAffix: null,
        addAffix: cleanName,
        vendor: 'Blacksmith',
        resultScore: 'Temper via manual',
        priority: 80
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
      resultScore: `Add ${needed} socket${needed > 1 ? 's' : ''}`,
      priority: 30
    }
  ]
}

/**
/**
 * Compares a scanned gear piece against the build's expected gear slot.
 *
 * This is the main entry point for the scoring engine.
 *
 * @param scannedItem - The gear piece just scanned via OCR
 * @param buildSlot - The build's expected gear for this slot
 * @returns A ScanVerdict with match scores, verdict, and recommendations
 */
export function compareGear(scannedItem: ScannedGearPiece, buildSlot: IGearSlot): ScanVerdict {
  // ---- Dynamically Extract Implicits ----
  // OCR dumps implicits into affixes. We must extract them so they aren't penalized as "extra" affixes.
  const combinedAffixes = [...scannedItem.implicitAffixes, ...scannedItem.affixes]
  const buildImplicits = buildSlot.implicitAffixes || []

  const resolvedImplicits: string[] = []
  const remainingBaseAffixes: string[] = []

  for (const aff of combinedAffixes) {
    if (buildImplicits.some((bi) => affixMatches(aff, bi.name))) {
      resolvedImplicits.push(aff)
    } else {
      remainingBaseAffixes.push(aff)
    }
  }

  // Update scannedItem to reflect the correct distributions
  scannedItem = {
    ...scannedItem,
    implicitAffixes: resolvedImplicits,
    affixes: remainingBaseAffixes
  }

  // ---- Unified affix pools ----
  // Combine all build affix categories into one required list for scoring.
  // Intentionally excludes implicitAffixes — they're fixed by item type and
  // scoring against them would inflate match counts for free.
  const allBuildAffixes: IAffix[] = [
    ...buildSlot.affixes,
    ...buildSlot.temperedAffixes,
    ...buildSlot.greaterAffixes
  ]

  // Combine all scanned affix categories into one pool for matching
  const allScannedAffixes: string[] = [
    ...scannedItem.affixes,
    ...scannedItem.temperedAffixes,
    ...scannedItem.greaterAffixes
  ]

  // ---- Build match scoring ----
  const { matched, missing } = matchAffixes(allScannedAffixes, allBuildAffixes)
  const extraAffixes = findExtraAffixes(allScannedAffixes, allBuildAffixes)
  // Use deduplicated count: matched + missing = total unique build affixes
  const totalExpected = matched.length + missing.length
  const matchPercent = totalExpected > 0 ? (matched.length / totalExpected) * 100 : 100

  // ---- Socket delta ----
  const expectedSockets = buildSlot.socketedGems.length
  const socketDelta = scannedItem.sockets - expectedSockets

  // ---- Verdict ----
  const verdict = determineVerdict(matchPercent)

  // ---- Aspect comparison ----
  const aspectComparison: ScanVerdict['aspectComparison'] = buildSlot.requiredAspect
    ? {
        expectedAspect: buildSlot.requiredAspect.name,
        hasMatch: scannedItem.aspect
          ? aspectMatches(scannedItem.aspect.name, buildSlot.requiredAspect.name)
          : false
      }
    : null

  // ---- Recommendations ----
  const recommendations: CraftingRecommendation[] = [
    ...generateEnchantRecommendations(extraAffixes, missing, scannedItem.greaterAffixes),
    // Pass the full unified scanned pool — OCR cannot distinguish tempered from regular
    // affixes in the tooltip (they appear identically), so we must check all pools
    ...generateTemperRecommendations(allScannedAffixes, buildSlot.temperedAffixes),
    ...generateSocketRecommendations(socketDelta)
  ]

  // Add aspect recommendation when aspect is missing
  if (aspectComparison && !aspectComparison.hasMatch) {
    const cleanAspect = normalizeAffix(aspectComparison.expectedAspect).parsedName || aspectComparison.expectedAspect
    recommendations.push({
      action: 'aspect',
      removeAffix: null,
      addAffix: cleanAspect,
      vendor: 'Occultist',
      resultScore: 'Imprint required aspect',
      priority: 90
    })
  }

  // Sort recommendations by priority (highest first)
  recommendations.sort((a, b) => b.priority - a.priority)

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
    aspectComparison,
    recommendations
  }
}
