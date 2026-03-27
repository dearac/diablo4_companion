/**
 * PerfectibilityEngine — S12 gear evaluation pipeline
 *
 * Runs a 4-step analysis to determine if a scanned gear piece can be
 * perfected for the loaded build:
 *   1. Bloodied Check — does the item qualify for killstreak mechanics?
 *   2. Base Affix Foundation — does it have at least 2/3 required base affixes?
 *   3. Greater Affix Check — are the expected drop-only GAs present?
 *   4. Tempering Forecast — which tempered affixes still need to be added?
 */

import { affixMatches } from './AffixMatcher'
import type {
  ScannedGearPiece,
  IGearSlot,
  PerfectibilityResult,
  PerfectibilityStep,
  PerfectibilityVerdict
} from './types'

// ─── Step helpers ────────────────────────────────────────────────────────────

/**
 * Step 1 — Bloodied Check.
 *
 * Builds that use Rampage or Feast killstreak mechanics require "Bloodied"
 * Ancestral items. If the build slot has either effect and the scanned item
 * name does not include "Bloodied", it fails immediately.
 */
function checkBloodied(
  itemName: string,
  buildSlot: IGearSlot
): PerfectibilityStep {
  const needsKillstreak =
    buildSlot.rampageEffect !== null || buildSlot.feastEffect !== null

  if (!needsKillstreak) {
    return {
      name: 'Bloodied',
      passed: true,
      skipped: true,
      reason: 'Build has no killstreak requirement — Bloodied prefix not needed.',
      action: null
    }
  }

  const hasBloodied = itemName.toLowerCase().includes('bloodied')
  if (hasBloodied) {
    return {
      name: 'Bloodied',
      passed: true,
      skipped: false,
      reason: 'Item has the Bloodied prefix — killstreak eligible.',
      action: null
    }
  }

  return {
    name: 'Bloodied',
    passed: false,
    skipped: false,
    reason:
      'Build requires a Bloodied item for killstreak but this item lacks the prefix.',
    action: 'Junk this item — Bloodied prefix cannot be added post-drop.'
  }
}

/**
 * Step 2 — Base Affix Foundation (2/3 Rule).
 *
 * At least 2 out of 3 (or more generally N-1) required base affixes must
 * already be present on the item. With exactly 2/3 matching, the third can
 * be obtained via enchanting. With 1/3 or fewer it's not worth crafting.
 */
function checkBaseAffixes(
  scannedAffixes: string[],
  buildAffixes: IGearSlot['affixes']
): PerfectibilityResult['steps']['baseAffixes'] {
  const totalBase = buildAffixes.length

  // Find which build affixes already match a scanned affix
  const matched = buildAffixes.filter((ba) =>
    scannedAffixes.some((sa) => affixMatches(sa, ba.name))
  )

  const unmatched = buildAffixes.filter(
    (ba) => !scannedAffixes.some((sa) => affixMatches(sa, ba.name))
  )

  const matchCount = matched.length
  const threshold = Math.max(totalBase - 1, 1) // need at least N-1 matches
  const passed = matchCount >= threshold

  // Identify enchant target: the one scanned affix that doesn't match any build affix
  let rerollTarget: string | null = null
  let rerollReplacement: string | null = null

  if (passed && matchCount < totalBase && unmatched.length > 0) {
    // Find the weakest unmatched scanned affix to be enchanted away
    const unmatchedScanned = scannedAffixes.filter(
      (sa) => !buildAffixes.some((ba) => affixMatches(sa, ba.name))
    )
    rerollTarget = unmatchedScanned[0] ?? null
    rerollReplacement = unmatched[0]?.name ?? null
  }

  return {
    name: 'Base Affixes (2/3 Rule)',
    passed,
    skipped: false,
    reason: passed
      ? matchCount === totalBase
        ? `All ${totalBase}/${totalBase} required base affixes present.`
        : `${matchCount}/${totalBase} required affixes match — 1 can be enchanted.`
      : `Only ${matchCount}/${totalBase} required affixes match — too few to salvage.`,
    action: passed
      ? rerollTarget
        ? `Enchant "${rerollTarget}" → "${rerollReplacement}".`
        : null
      : 'Junk this item — base affix foundation is insufficient.',
    matchCount,
    totalBase,
    rerollTarget,
    rerollReplacement
  }
}

/**
 * Step 3 — Greater Affix Check.
 *
 * Greater Affixes are drop-only. If the build expects a GA on a particular
 * stat and the scanned item doesn't have it, the item can never be perfected.
 */
function checkGreaterAffixes(
  scannedGA: string[],
  buildGA: IGearSlot['greaterAffixes']
): PerfectibilityResult['steps']['greaterAffixes'] {
  if (buildGA.length === 0) {
    return {
      name: 'Greater Affixes',
      passed: true,
      skipped: true,
      reason: 'Build requires no Greater Affixes on this slot.',
      action: null,
      missingGA: []
    }
  }

  const missingGA = buildGA
    .filter((bga) => !scannedGA.some((sga) => affixMatches(sga, bga.name)))
    .map((bga) => bga.name)

  const passed = missingGA.length === 0

  return {
    name: 'Greater Affixes',
    passed,
    skipped: false,
    reason: passed
      ? 'All required Greater Affixes are present.'
      : `Missing ${missingGA.length} required Greater Affix${missingGA.length > 1 ? 'es' : ''}: ${missingGA.join(', ')}.`,
    action: passed
      ? null
      : 'Junk this item — missing GAs cannot be added after the drop.',
    missingGA
  }
}

/**
 * Step 4 — Tempering Forecast.
 *
 * Tempered affixes can be added at the Blacksmith or Jeweler. Any that
 * are not yet present are flagged as still needing to be applied.
 */
function checkTempering(
  allScannedAffixes: string[],
  buildTemperedAffixes: IGearSlot['temperedAffixes']
): PerfectibilityResult['steps']['tempering'] {
  if (buildTemperedAffixes.length === 0) {
    return {
      name: 'Tempering',
      passed: true,
      skipped: true,
      reason: 'Build requires no tempered affixes on this slot.',
      action: null,
      missingTempers: []
    }
  }

  const missingTempers = buildTemperedAffixes
    .filter((bt) => !allScannedAffixes.some((sa) => affixMatches(sa, bt.name)))
    .map((bt) => bt.name)

  const passed = missingTempers.length === 0

  return {
    name: 'Tempering',
    passed,
    skipped: false,
    reason: passed
      ? 'All required tempered affixes are already applied.'
      : `${missingTempers.length} temper${missingTempers.length > 1 ? 's' : ''} still needed: ${missingTempers.join(', ')}.`,
    action: passed
      ? null
      : `Apply the following tempers at the Blacksmith: ${missingTempers.join(', ')}.`,
    missingTempers
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Runs the full 4-step S12 perfectibility evaluation pipeline.
 *
 * @param scannedItem - The gear piece read from the OCR scanner
 * @param buildSlot   - The build's requirements for that slot
 * @returns A full PerfectibilityResult with per-step verdicts and an overall verdict
 */
export function evaluatePerfectibility(
  scannedItem: ScannedGearPiece,
  buildSlot: IGearSlot
): PerfectibilityResult {
  const bloodied = checkBloodied(scannedItem.itemName, buildSlot)

  // Gate: if Bloodied fails, the item is NOT_PERFECTIBLE immediately
  if (!bloodied.passed) {
    const baseAffixes = checkBaseAffixes(scannedItem.affixes, buildSlot.affixes)
    const greaterAffixes = checkGreaterAffixes(
      scannedItem.greaterAffixes,
      buildSlot.greaterAffixes
    )
    const tempering = checkTempering(
      [...scannedItem.affixes, ...scannedItem.temperedAffixes],
      buildSlot.temperedAffixes
    )
    return {
      overallVerdict: 'NOT_PERFECTIBLE',
      overallReason: bloodied.reason,
      steps: { bloodied, baseAffixes, greaterAffixes, tempering }
    }
  }

  const baseAffixes = checkBaseAffixes(scannedItem.affixes, buildSlot.affixes)

  // Gate: if base affixes fail, the item is NOT_PERFECTIBLE
  if (!baseAffixes.passed) {
    const greaterAffixes = checkGreaterAffixes(
      scannedItem.greaterAffixes,
      buildSlot.greaterAffixes
    )
    const tempering = checkTempering(
      [...scannedItem.affixes, ...scannedItem.temperedAffixes],
      buildSlot.temperedAffixes
    )
    return {
      overallVerdict: 'NOT_PERFECTIBLE',
      overallReason: baseAffixes.reason,
      steps: { bloodied, baseAffixes, greaterAffixes, tempering }
    }
  }

  const greaterAffixes = checkGreaterAffixes(
    scannedItem.greaterAffixes,
    buildSlot.greaterAffixes
  )

  const tempering = checkTempering(
    [...scannedItem.affixes, ...scannedItem.temperedAffixes],
    buildSlot.temperedAffixes
  )

  // Determine overall verdict
  let overallVerdict: PerfectibilityVerdict
  let overallReason: string

  if (!greaterAffixes.passed) {
    overallVerdict = 'NOT_PERFECTIBLE'
    overallReason = greaterAffixes.reason
  } else if (!tempering.passed) {
    overallVerdict = 'RISKY'
    overallReason = `Good base — but ${tempering.missingTempers.length} temper${tempering.missingTempers.length > 1 ? 's' : ''} still needed.`
  } else {
    overallVerdict = 'PERFECTIBLE'
    overallReason = 'All checks pass — this item can be perfected for the build.'
  }

  return {
    overallVerdict,
    overallReason,
    steps: { bloodied, baseAffixes, greaterAffixes, tempering }
  }
}
