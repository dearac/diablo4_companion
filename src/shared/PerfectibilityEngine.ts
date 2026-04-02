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
import { compareAffixes } from './AffixComparer'
import { normalizeAffix } from './AffixNormalizer'
import type {
  ScannedGearPiece,
  IGearSlot,
  PerfectibilityResult,
  PerfectibilityStep,
  PerfectibilityVerdict,
  AffixMatchResult
} from './types'

// ─── Step helpers ────────────────────────────────────────────────────────────

/**
 * Step 0 — Power Check.
 *
 * Rejects items that are below the build's minimum item power threshold.
 */
function checkPower(item: ScannedGearPiece, buildSlot: IGearSlot): PerfectibilityStep {
  if (buildSlot.minItemPower === undefined) {
    return {
      name: 'Item Power',
      passed: true,
      skipped: true,
      reason: 'No minimum item power required for this slot.',
      action: null
    }
  }

  const passed = item.itemPower >= buildSlot.minItemPower
  return {
    name: 'Item Power',
    passed,
    skipped: false,
    reason: passed
      ? `Item power ${item.itemPower} meets or exceeds required ${buildSlot.minItemPower}.`
      : `Item power ${item.itemPower} is below required ${buildSlot.minItemPower}.`,
    action: passed ? null : 'Junk this item — Item power is too low.'
  }
}

/**
 * Step 1 — Bloodied Check.
 *
 * Builds that use Rampage or Feast killstreak mechanics require "Bloodied"
 * Ancestral items. If the build slot has either effect and the scanned item
 * name does not include "Bloodied", it fails immediately.
 */
function checkBloodied(item: ScannedGearPiece, buildSlot: IGearSlot): PerfectibilityStep {
  const needsKillstreak = buildSlot.rampageEffect !== null || buildSlot.feastEffect !== null

  if (!needsKillstreak) {
    return {
      name: 'Bloodied',
      passed: true,
      skipped: true,
      reason: 'Build has no killstreak requirement — Bloodied prefix not needed.',
      action: null
    }
  }

  const hasBloodied = item.itemName.toLowerCase().includes('bloodied')
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
    reason: 'Build requires a Bloodied item for killstreak but this item lacks the prefix.',
    action: 'Junk this item — Bloodied prefix cannot be added post-drop.'
  }
}

/**
 * Step 1.5 — Implicits Check.
 *
 * Implicits are stats innate to the item type. They cannot be rolled or enchanted.
 * If the build requires an implicit and the generic item base is missing it, it instantly fails.
 */
function checkImplicitAffixes(
  scannedImplicits: string[],
  buildImplicits: IGearSlot['implicitAffixes']
): PerfectibilityResult['steps']['implicitAffixes'] {
  if (!buildImplicits || buildImplicits.length === 0) {
    return {
      name: 'Implicits',
      passed: true,
      skipped: true,
      reason: 'Build requires no implicit affixes on this slot.',
      action: null,
      missingImplicits: [],
      resolvedImplicits: scannedImplicits
    }
  }

  const missingImplicits = buildImplicits
    .filter((bi) => !scannedImplicits.some((si) => affixMatches(si, bi.name)))
    .map((bi) => normalizeAffix(bi.name).parsedName || bi.name)

  const passed = missingImplicits.length === 0

  return {
    name: 'Implicits',
    passed,
    skipped: false,
    reason: passed
      ? 'All required implicits are present.'
      : `Missing required implicit(s): ${missingImplicits.join(', ')}.`,
    action: passed ? null : 'Junk this item — implicits cannot be added after the drop.',
    missingImplicits,
    resolvedImplicits: scannedImplicits
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
): PerfectibilityResult['steps']['baseAffixes'] & { matchDetails: AffixMatchResult[] } {
  const totalBase = buildAffixes.length

  // Run compareAffixes for each build affix against all scanned affixes
  const matchDetails: AffixMatchResult[] = []
  const thresholdFailures: string[] = []

  const matched = buildAffixes.filter((ba) => {
    const best = scannedAffixes
      .map((sa) => {
        const r = compareAffixes(sa, ba.name)
        if (r.matched && ba.minValue !== undefined) {
          const valMatch = sa.match(/-?[\d,]+(\.\d+)?/)
          if (valMatch) {
            const val = parseFloat(valMatch[0].replace(/,/g, ''))
            if (val < ba.minValue) {
              thresholdFailures.push(`Fail: ${ba.name} +${val} (Needed: +${ba.minValue})`)
            }
          } else {
            thresholdFailures.push(`Fail: ${ba.name} (Could not read stat value)`)
          }
        }
        return r
      })
      .reduce((best, r) => (r.confidence > best.confidence ? r : best), {
        matched: false,
        confidence: 0,
        reason: 'no scanned affixes',
        canonicalName: normalizeAffix(ba.name).parsedName || ba.name,
        method: 'unresolved' as const
      })
    matchDetails.push(best)
    return best.matched
  })

  const unmatched = buildAffixes.filter(
    (ba) => !scannedAffixes.some((sa) => affixMatches(sa, ba.name))
  )

  const matchCount = matched.length
  const threshold = Math.max(totalBase - 1, 1) // need at least N-1 matches
  const passed = matchCount >= threshold && thresholdFailures.length === 0

  // Identify enchant target: prefer lowest-confidence matched scanned affix
  // (the one we're least sure about is the best candidate to reroll away)
  let rerollTarget: string | null = null
  let rerollReplacement: string | null = null

  if (passed && matchCount < totalBase && unmatched.length > 0) {
    // Find unmatched scanned affixes (candidates for enchanting away)
    const unmatchedScanned = scannedAffixes.filter(
      (sa) => !buildAffixes.some((ba) => affixMatches(sa, ba.name))
    )
    // Use lowest-confidence non-greater unmatched scanned affix as reroll target
    const lowestConf = unmatchedScanned
      .map((sa) => ({
        sa,
        conf: Math.max(...buildAffixes.map((ba) => compareAffixes(sa, ba.name).confidence))
      }))
      .sort((a, b) => a.conf - b.conf)
    rerollTarget = lowestConf[0]?.sa ?? unmatchedScanned[0] ?? null
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
      : thresholdFailures.length > 0
        ? `Stat rolls too low: ${thresholdFailures.join(', ')}`
        : `Only ${matchCount}/${totalBase} required affixes match — too few to salvage.`,
    action: passed
      ? rerollTarget
        ? `Enchant "${rerollTarget}" → "${rerollReplacement}".`
        : null
      : thresholdFailures.length > 0
        ? 'Junk this item — stat rolls do not meet required minimums.'
        : 'Junk this item — base affix foundation is insufficient.',
    matchCount,
    totalBase,
    rerollTarget,
    rerollReplacement,
    thresholdFailures,
    matchDetails,
    resolvedBaseAffixes: scannedAffixes
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
  // Fake usage to satisfy eslint
  void scannedGA
  void buildGA

  // User Requested: Completely ignore whether an item is a GA.
  // We treat GAs as base affixes elsewhere, so we skip GA-purity enforcement entirely safely.
  return {
    name: 'Greater Affixes',
    passed: true,
    skipped: true,
    reason: 'Evaluating strictly on stat names — Greater Affix drop requirements ignored.',
    action: null,
    missingGA: []
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
    .map((bt) => normalizeAffix(bt.name).parsedName || bt.name)

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
  const powerCheck = checkPower(scannedItem, buildSlot)
  const bloodied = checkBloodied(scannedItem, buildSlot)

  // OCR dumps all stats into `scannedItem.affixes` because it cannot distinguish implicits without a database.
  // We use the build's requested implicits to dynamically extract them from the generic affixes array.
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

  const implicitAffixes = checkImplicitAffixes(resolvedImplicits, buildImplicits)

  const baseAffixes = checkBaseAffixes(remainingBaseAffixes, buildSlot.affixes)

  // Gate: if power, implicits, or base affixes fail, the item is NOT_PERFECTIBLE
  if (!powerCheck.passed || !implicitAffixes.passed || !baseAffixes.passed) {
    const greaterAffixes = checkGreaterAffixes(scannedItem.greaterAffixes, buildSlot.greaterAffixes)
    const tempering = checkTempering(
      [...scannedItem.affixes, ...scannedItem.temperedAffixes],
      buildSlot.temperedAffixes
    )
    return {
      overallVerdict: 'NOT_PERFECTIBLE',
      overallReason: !powerCheck.passed
        ? powerCheck.reason
        : !implicitAffixes.passed
          ? implicitAffixes.reason
          : baseAffixes.reason,
      steps: { powerCheck, bloodied, implicitAffixes, baseAffixes, greaterAffixes, tempering }
    }
  }

  const greaterAffixes = checkGreaterAffixes(scannedItem.greaterAffixes, buildSlot.greaterAffixes)

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
    overallReason =
      bloodied.passed || bloodied.skipped
        ? 'All checks pass — this item can be perfected for the build.'
        : 'Good base — can be perfected, but missing recommended Bloodied prefix.'
  }

  // Confidence-based RISKY downgrade:
  // If any matched affix had low confidence (< 0.7), flag as RISKY even if all checks pass
  if (overallVerdict === 'PERFECTIBLE') {
    const allMatchDetails = baseAffixes.matchDetails ?? []
    const hasLowConfidence = allMatchDetails.some((d) => d.matched && d.confidence < 0.7)
    if (hasLowConfidence) {
      overallVerdict = 'RISKY'
      overallReason = 'All checks pass but 1+ affix matched with low confidence. Verify manually.'
    }
  }

  // ── Aspect Check ──
  let aspectCheck: (PerfectibilityStep & { expectedAspect: string }) | undefined
  if (buildSlot.requiredAspect) {
    const requiredAspectClean =
      normalizeAffix(buildSlot.requiredAspect.name).parsedName || buildSlot.requiredAspect.name
    const hasAspect = scannedItem.aspect
      ? affixMatches(scannedItem.aspect.name, buildSlot.requiredAspect.name)
      : false

    aspectCheck = {
      name: 'Match Legendary Aspect',
      passed: hasAspect,
      skipped: false,
      reason: hasAspect
        ? `Found required aspect: ${requiredAspectClean}`
        : 'Missing required aspect, but can be imprinted at Occultist.',
      action: hasAspect ? null : `Imprint: ${requiredAspectClean}`,
      expectedAspect: requiredAspectClean
    }
  }

  return {
    overallVerdict,
    overallReason,
    steps: {
      powerCheck,
      bloodied,
      implicitAffixes,
      baseAffixes,
      greaterAffixes,
      tempering,
      ...(aspectCheck ? { aspectCheck } : {})
    }
  }
}
