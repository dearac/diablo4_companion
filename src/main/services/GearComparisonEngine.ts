/**
 * GearComparisonEngine — Compares gear against build requirements.
 *
 * Two modes of operation:
 *
 * Mode 1 — Equipped vs Build (generateBuildVerdict):
 *   Compare what the user is wearing against what the build requires.
 *   For each slot, produces an IGearVerdict with match rating.
 *
 * Mode 2 — Inventory vs (Equipped + Build) (evaluateInventoryItem):
 *   Compare a dropped/inventory item against the user's current gear
 *   and the build requirements. Determines if the item is an upgrade.
 *
 * Fuzzy matching:
 *   OCR text rarely matches build data exactly. We normalize affix names
 *   (lowercase, strip numbers/symbols) and compare word overlap.
 */

import type {
  IGearSlot,
  IAffix,
  IScannedItem,
  IScannedAffix,
  IEquippedGear,
  IGearVerdict,
  IVerdictDetail,
  IInventoryVerdict
} from '../../shared/types'

// ============================================================
// Configuration
// ============================================================

/** Minimum word overlap ratio for a fuzzy match (0.0-1.0) */
const FUZZY_MATCH_THRESHOLD = 0.60

// ============================================================
// GearComparisonEngine
// ============================================================

export class GearComparisonEngine {
  /**
   * Mode 1 — Compare equipped gear against build requirements.
   *
   * Produces a verdict for each slot showing:
   *   - Does the aspect match?
   *   - Which required affixes are present/missing?
   *   - Overall rating (PERFECT, GOOD, CLOSE, WRONG)
   */
  generateBuildVerdict(
    equippedGear: IEquippedGear,
    buildSlots: IGearSlot[]
  ): IGearVerdict[] {
    const verdicts: IGearVerdict[] = []

    for (const buildSlot of buildSlots) {
      // Find the matching equipped item
      const equipped = this.findEquippedForSlot(equippedGear, buildSlot.slot)

      if (!equipped) {
        // Slot is empty — no item equipped
        verdicts.push({
          slot: buildSlot.slot,
          overallRating: 'WRONG',
          overallScore: 0,
          details: [{
            category: 'Item',
            expected: buildSlot.itemName || 'Any item',
            found: 'Empty slot',
            matched: false,
            advice: 'Equip an item in this slot and scan it'
          }]
        })
        continue
      }

      const details: IVerdictDetail[] = []
      let totalChecks = 0
      let matchedChecks = 0

      // Check aspect
      if (buildSlot.requiredAspect) {
        totalChecks++
        const aspectMatch = equipped.aspect
          ? this.fuzzyMatch(buildSlot.requiredAspect.name, equipped.aspect.name)
          : false

        details.push({
          category: 'Aspect',
          expected: buildSlot.requiredAspect.name,
          found: equipped.aspect?.name || 'None',
          matched: aspectMatch,
          advice: aspectMatch ? '' : `Need: ${buildSlot.requiredAspect.name}`
        })

        if (aspectMatch) matchedChecks++
      }

      // Check regular affixes
      for (const reqAffix of buildSlot.affixes) {
        totalChecks++
        const found = this.findMatchingAffix(reqAffix, equipped.affixes)

        details.push({
          category: reqAffix.isGreater ? 'Greater Affix' : 'Affix',
          expected: reqAffix.name,
          found: found ? found.name : 'Missing',
          matched: !!found,
          advice: found ? '' : `Missing: ${reqAffix.name}`
        })

        if (found) matchedChecks++
      }

      // Check tempered affixes
      for (const reqAffix of buildSlot.temperedAffixes) {
        totalChecks++
        const found = this.findMatchingAffix(reqAffix, equipped.temperedAffixes)

        details.push({
          category: 'Tempered',
          expected: reqAffix.name,
          found: found ? found.name : 'Missing',
          matched: !!found,
          advice: found ? '' : `Need tempered: ${reqAffix.name}`
        })

        if (found) matchedChecks++
      }

      // Check greater affixes
      for (const reqAffix of buildSlot.greaterAffixes) {
        totalChecks++
        const found = this.findMatchingAffix(reqAffix, equipped.greaterAffixes)

        details.push({
          category: 'Greater Affix',
          expected: reqAffix.name,
          found: found ? found.name : 'Missing',
          matched: !!found,
          advice: found ? '' : `Need greater: ${reqAffix.name}`
        })

        if (found) matchedChecks++
      }

      // Calculate overall score and rating
      const score = totalChecks > 0 ? matchedChecks / totalChecks : 0
      const hasAspect = !buildSlot.requiredAspect || details.some(
        d => d.category === 'Aspect' && d.matched
      )

      let rating: 'PERFECT' | 'GOOD' | 'CLOSE' | 'WRONG'
      if (score >= 1.0) {
        rating = 'PERFECT'
      } else if (score >= 0.7 && hasAspect) {
        rating = 'GOOD'
      } else if (hasAspect || score >= 0.4) {
        rating = 'CLOSE'
      } else {
        rating = 'WRONG'
      }

      verdicts.push({
        slot: buildSlot.slot,
        overallRating: rating,
        overallScore: Math.round(score * 100),
        details
      })
    }

    return verdicts
  }

  /**
   * Mode 2 — Evaluate an inventory item as a potential upgrade.
   *
   * Compares the scanned drop against:
   *   1. What's currently equipped in that slot
   *   2. What the build requires for that slot
   */
  evaluateInventoryItem(
    scannedItem: IScannedItem,
    equippedGear: IEquippedGear,
    buildSlots: IGearSlot[]
  ): IInventoryVerdict {
    // Find the build requirements for this slot
    const buildSlot = this.findBuildSlot(scannedItem.slot, buildSlots)
    const slotKey = scannedItem.slot

    // Find what's currently equipped in this slot
    const equipped = this.findEquippedForSlot(equippedGear, slotKey)

    // Calculate how well the drop matches the build
    const dropBuildAffixes = this.getMatchedBuildAffixes(scannedItem, buildSlot)
    const equippedBuildAffixes = equipped
      ? this.getMatchedBuildAffixes(this.scannedToScannedProxy(equipped), buildSlot)
      : new Set<string>()

    // What does the drop have that equipped doesn't?
    const gains = [...dropBuildAffixes].filter(a => !equippedBuildAffixes.has(a))

    // What does equipped have that the drop doesn't?
    const losses = [...equippedBuildAffixes].filter(a => !dropBuildAffixes.has(a))

    // What's still missing from the build regardless?
    const allBuildAffixes = buildSlot
      ? [...buildSlot.affixes, ...buildSlot.temperedAffixes, ...buildSlot.greaterAffixes]
          .map(a => a.name)
      : []
    const stillMissing = allBuildAffixes.filter(a =>
      !dropBuildAffixes.has(a) && !equippedBuildAffixes.has(a)
    )

    // Calculate upgrade score
    const upgradeScore = gains.length - losses.length

    // Check aspect
    let aspectDelta = 0
    if (buildSlot?.requiredAspect) {
      const dropHasAspect = scannedItem.aspect
        ? this.fuzzyMatch(buildSlot.requiredAspect.name, scannedItem.aspect.name)
        : false
      const equippedHasAspect = equipped?.aspect
        ? this.fuzzyMatch(buildSlot.requiredAspect.name, equipped.aspect.name)
        : false

      if (dropHasAspect && !equippedHasAspect) aspectDelta = 3
      if (!dropHasAspect && equippedHasAspect) aspectDelta = -3
    }

    const totalScore = upgradeScore + aspectDelta

    // Generate recommendation
    let recommendation: 'EQUIP' | 'SALVAGE' | 'KEEP_FOR_TEMPER' | 'SIDEGRADE'
    if (totalScore > 0) {
      recommendation = 'EQUIP'
    } else if (totalScore < -1) {
      recommendation = 'SALVAGE'
    } else if (gains.length > 0 && losses.length > 0) {
      recommendation = 'SIDEGRADE'
    } else {
      recommendation = 'SALVAGE'
    }

    // Special case: item has right base but wrong affixes, good for tempering
    if (recommendation === 'SALVAGE' && scannedItem.temperedAffixes.length === 0
        && buildSlot && buildSlot.temperedAffixes.length > 0) {
      const hasGoodBase = dropBuildAffixes.size >= 2
      if (hasGoodBase) {
        recommendation = 'KEEP_FOR_TEMPER'
      }
    }

    return {
      scannedItem,
      comparedToSlot: slotKey,
      isUpgrade: totalScore > 0,
      upgradeScore: totalScore,
      gainsOverEquipped: gains,
      lossesFromEquipped: losses,
      stillMissingFromBuild: stillMissing,
      recommendation
    }
  }

  // ──────────────────────────────────────────────────
  // Helper methods
  // ──────────────────────────────────────────────────

  /**
   * Finds the equipped item for a given slot.
   * Handles variations like "Ring" → "Ring 1"/"Ring 2".
   */
  private findEquippedForSlot(
    gear: IEquippedGear,
    slotName: string
  ): IScannedItem | null {
    // Direct match
    if (gear.slots[slotName]) return gear.slots[slotName]

    // Try Ring 1/2 variations
    if (slotName.toLowerCase().includes('ring')) {
      return gear.slots['Ring 1'] || gear.slots['Ring 2'] || null
    }

    // Try weapon variations
    const weaponPatterns = ['weapon', 'sword', 'mace', 'axe', 'dagger', 'wand',
      'staff', 'bow', 'crossbow', 'polearm', 'scythe']
    if (weaponPatterns.some(p => slotName.toLowerCase().includes(p))) {
      return gear.slots['Weapon'] || gear.slots[slotName] || null
    }

    return null
  }

  /**
   * Finds the build slot matching a scanned item's slot.
   */
  private findBuildSlot(
    slotName: string,
    buildSlots: IGearSlot[]
  ): IGearSlot | null {
    // Direct match
    const direct = buildSlots.find(s =>
      s.slot.toLowerCase() === slotName.toLowerCase()
    )
    if (direct) return direct

    // Fuzzy match
    return buildSlots.find(s => this.fuzzyMatch(s.slot, slotName)) || null
  }

  /**
   * Gets the set of build-required affix names that a scanned item matches.
   */
  private getMatchedBuildAffixes(
    item: IScannedItem,
    buildSlot: IGearSlot | null
  ): Set<string> {
    const matched = new Set<string>()
    if (!buildSlot) return matched

    const allItemAffixes = [
      ...item.affixes,
      ...item.temperedAffixes,
      ...item.greaterAffixes,
      ...item.implicitAffixes
    ]

    const allBuildAffixes = [
      ...buildSlot.affixes,
      ...buildSlot.temperedAffixes,
      ...buildSlot.greaterAffixes
    ]

    for (const buildAffix of allBuildAffixes) {
      for (const itemAffix of allItemAffixes) {
        if (this.fuzzyMatch(buildAffix.name, itemAffix.name)) {
          matched.add(buildAffix.name)
          break
        }
      }
    }

    return matched
  }

  /**
   * Converts an IScannedItem's IScannedAffix arrays for comparison.
   * Needed since equipped items are IScannedItem (not IAffix).
   */
  private scannedToScannedProxy(item: IScannedItem): IScannedItem {
    return item // Already the right type
  }

  /**
   * Finds a matching affix in a scanned item's affix array.
   */
  private findMatchingAffix(
    required: IAffix,
    scannedAffixes: IScannedAffix[]
  ): IScannedAffix | null {
    for (const affix of scannedAffixes) {
      if (this.fuzzyMatch(required.name, affix.name)) {
        return affix
      }
    }
    return null
  }

  /**
   * Fuzzy string matching for affix names.
   *
   * OCR text is messy: "+15.5% Dmg to Close" vs "Damage to Close Enemies"
   * We normalize both strings and compare word overlap.
   *
   * @returns true if enough words overlap (above FUZZY_MATCH_THRESHOLD)
   */
  private fuzzyMatch(a: string, b: string): boolean {
    const wordsA = this.normalizeForMatch(a)
    const wordsB = this.normalizeForMatch(b)

    if (wordsA.length === 0 || wordsB.length === 0) return false

    // Count matching words
    let matches = 0
    for (const word of wordsA) {
      if (wordsB.includes(word)) matches++
    }

    // Use the shorter list as the denominator
    const denominator = Math.min(wordsA.length, wordsB.length)
    const ratio = matches / denominator

    return ratio >= FUZZY_MATCH_THRESHOLD
  }

  /**
   * Normalizes a string for fuzzy matching.
   * Strips numbers, symbols, and converts to lowercase words.
   */
  private normalizeForMatch(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[+×x%\d.,]/g, '')      // Strip numbers and symbols
      .replace(/[^a-z\s]/g, '')         // Keep only letters and spaces
      .split(/\s+/)                     // Split into words
      .filter(w => w.length > 1)        // Drop single-letter artifacts
  }
}
