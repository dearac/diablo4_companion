import { describe, it, expect } from 'vitest'
import { compareGear } from '../../../src/shared/GearComparer'
import type { ScannedGearPiece, IGearSlot } from '../../../src/shared/types'

const makeScanned = (overrides: Partial<ScannedGearPiece> = {}): ScannedGearPiece => ({
  slot: 'Helm',
  itemName: 'Test Helm',
  itemType: 'Legendary',
  itemPower: 925,
  affixes: ['+10% Critical Strike Chance', '+12% Vulnerable Damage'],
  implicitAffixes: [],
  temperedAffixes: [],
  greaterAffixes: [],
  sockets: 1,
  socketContents: [],
  aspect: null,
  rawText: '',
  ...overrides
})

const makeBuildSlot = (overrides: Partial<IGearSlot> = {}): IGearSlot => ({
  slot: 'Helm',
  itemName: null,
  itemType: 'Legendary',
  requiredAspect: null,
  affixes: [
    { name: 'Critical Strike Chance', isGreater: false },
    { name: 'Vulnerable Damage', isGreater: false },
    { name: 'Cooldown Reduction', isGreater: false }
  ],
  implicitAffixes: [],
  temperedAffixes: [],
  greaterAffixes: [],
  masterworkPriority: [],
  rampageEffect: null,
  feastEffect: null,
  socketedGems: ['Royal Ruby'],
  ...overrides
})

describe('GearComparer', () => {
  describe('build match scoring', () => {
    it('should calculate build match count correctly', () => {
      const verdict = compareGear(makeScanned(), makeBuildSlot())

      expect(verdict.buildMatchCount).toBe(2)
      expect(verdict.buildTotalExpected).toBe(3)
      expect(verdict.buildMatchPercent).toBeCloseTo(66.67, 0)
      expect(verdict.matchedAffixes).toContain('Critical Strike Chance')
      expect(verdict.matchedAffixes).toContain('Vulnerable Damage')
      expect(verdict.missingAffixes).toContain('Cooldown Reduction')
    })

    it('should identify extra affixes not required by build', () => {
      const scanned = makeScanned({
        affixes: ['+10% Critical Strike Chance', '+100 Thorns', '+5 Strength']
      })
      const verdict = compareGear(scanned, makeBuildSlot())

      expect(verdict.extraAffixes).toContain('+100 Thorns')
      expect(verdict.extraAffixes).toContain('+5 Strength')
    })

    it('should return 100% match when all affixes present', () => {
      const scanned = makeScanned({
        affixes: ['+10% Critical Strike Chance', '+12% Vulnerable Damage', '+8% Cooldown Reduction']
      })
      const verdict = compareGear(scanned, makeBuildSlot())

      expect(verdict.buildMatchCount).toBe(3)
      expect(verdict.buildMatchPercent).toBe(100)
    })

    it('should use fuzzy substring matching for affix names', () => {
      // Build expects "Critical Strike Chance", item has "+15.5% Critical Strike Chance"
      const scanned = makeScanned({
        affixes: ['+15.5% Critical Strike Chance']
      })
      const buildSlot = makeBuildSlot({
        affixes: [{ name: 'Critical Strike Chance', isGreater: false }]
      })
      const verdict = compareGear(scanned, buildSlot)

      expect(verdict.buildMatchCount).toBe(1)
      expect(verdict.matchedAffixes).toContain('Critical Strike Chance')
    })

    it('should ignore bloodied affix in scoring and extras', () => {
      const scanned = makeScanned({
        affixes: ['+10% Critical Strike Chance', '+100% Bloodied Damage']
      })
      const buildSlot = makeBuildSlot({
        affixes: [
          { name: 'Critical Strike Chance', isGreater: false },
          { name: 'Bloodied Damage', isGreater: false }
        ]
      })
      const verdict = compareGear(scanned, buildSlot)

      expect(verdict.buildTotalExpected).toBe(1)
      expect(verdict.matchedAffixes).toContain('Critical Strike Chance')
      expect(verdict.extraAffixes).not.toContain('+100% Bloodied Damage')
    })
  })

  describe('verdict thresholds', () => {
    it('should return PERFECT at 100% match', () => {
      const scanned = makeScanned({
        affixes: [
          '+10% Critical Strike Chance',
          '+12% Vulnerable Damage',
          '+8% Cooldown Reduction'
        ],
        sockets: 1
      })
      const verdict = compareGear(scanned, makeBuildSlot())

      expect(verdict.verdict).toBe('PERFECT')
    })

    it('should return UPGRADE at 90%+ match', () => {
      // 9 out of 10 affixes
      const realStats = [
        'Critical Strike Chance',
        'Vulnerable Damage',
        'Cooldown Reduction',
        'Maximum Life',
        'Strength',
        'Dexterity',
        'Intelligence',
        'Willpower',
        'Armor',
        'Movement Speed'
      ]
      const affixes = realStats.map((name) => ({ name, isGreater: false }))
      const scannedAffixes = realStats.slice(0, 9).map((name) => `+10% ${name}`)
      const scanned = makeScanned({ affixes: scannedAffixes })
      const buildSlot = makeBuildSlot({ affixes })
      const verdict = compareGear(scanned, buildSlot)

      expect(verdict.verdict).toBe('UPGRADE')
    })

    it('should return SIDEGRADE at 60-89% match', () => {
      const verdict = compareGear(makeScanned(), makeBuildSlot())
      // 2/3 = 66.7%
      expect(verdict.verdict).toBe('SIDEGRADE')
    })

    it('should return DOWNGRADE below 60% match', () => {
      const scanned = makeScanned({
        affixes: ['+100 Thorns'] // 0 matches out of 3 expected
      })
      const verdict = compareGear(scanned, makeBuildSlot())

      expect(verdict.verdict).toBe('DOWNGRADE')
    })
  })

  describe('socket handling', () => {
    it('should flag missing sockets', () => {
      const scanned = makeScanned({ sockets: 0 })
      const buildSlot = makeBuildSlot({ socketedGems: ['Royal Ruby'] })
      const verdict = compareGear(scanned, buildSlot)

      expect(verdict.socketDelta).toBe(-1)
      expect(verdict.recommendations.some((r) => r.action === 'socket')).toBe(true)
    })

    it('should not recommend sockets when count matches', () => {
      const scanned = makeScanned({ sockets: 1 })
      const buildSlot = makeBuildSlot({ socketedGems: ['Royal Ruby'] })
      const verdict = compareGear(scanned, buildSlot)

      expect(verdict.socketDelta).toBe(0)
      expect(verdict.recommendations.some((r) => r.action === 'socket')).toBe(false)
    })

    it('should handle builds with no socket requirements', () => {
      const scanned = makeScanned({ sockets: 0 })
      const buildSlot = makeBuildSlot({ socketedGems: [] })
      const verdict = compareGear(scanned, buildSlot)

      expect(verdict.socketDelta).toBe(0)
    })
  })

  describe('enchant recommendations', () => {
    it('should recommend enchanting when 1 affix is expendable', () => {
      const scanned = makeScanned({
        affixes: ['+10% Critical Strike Chance', '+100 Thorns']
      })
      const verdict = compareGear(scanned, makeBuildSlot())

      const enchantRec = verdict.recommendations.find((r) => r.action === 'enchant')
      expect(enchantRec).toBeDefined()
      expect(enchantRec!.removeAffix).toBe('Thorns')
    })

    it('should never recommend rerolling a greater affix', () => {
      const scanned = makeScanned({
        affixes: ['+10% Critical Strike Chance', '+100 Thorns'],
        greaterAffixes: ['Thorns']
      })
      const verdict = compareGear(scanned, makeBuildSlot())

      const enchantRecs = verdict.recommendations.filter((r) => r.action === 'enchant')
      for (const rec of enchantRecs) {
        // The removeAffix should never be a greater affix
        expect(rec.removeAffix).not.toContain('Thorns')
      }
    })

    it('should not recommend enchanting when all affixes match build', () => {
      const scanned = makeScanned({
        affixes: ['+10% Critical Strike Chance', '+12% Vulnerable Damage', '+8% Cooldown Reduction']
      })
      const verdict = compareGear(scanned, makeBuildSlot())

      const enchantRecs = verdict.recommendations.filter((r) => r.action === 'enchant')
      expect(enchantRecs).toHaveLength(0)
    })

    it('should suggest the most impactful missing affix for enchanting', () => {
      // Item has 1 match, 1 expendable, missing 2 from build
      const scanned = makeScanned({
        affixes: ['+10% Critical Strike Chance', '+100 Thorns']
      })
      const verdict = compareGear(scanned, makeBuildSlot())

      const enchantRec = verdict.recommendations.find((r) => r.action === 'enchant')
      expect(enchantRec).toBeDefined()
      // Should suggest adding one of the missing affixes
      expect(['Vulnerable Damage', 'Cooldown Reduction']).toContain(enchantRec!.addAffix)
    })
  })

  describe('greater affix tracking', () => {
    it('should count greater affixes', () => {
      const scanned = makeScanned({
        greaterAffixes: ['Critical Strike Chance', 'Vulnerable Damage']
      })
      const verdict = compareGear(scanned, makeBuildSlot())

      expect(verdict.greaterAffixCount).toBe(2)
    })
  })

  describe('temper recommendations', () => {
    it('should recommend tempering when tempered affix slots are available', () => {
      const scanned = makeScanned({
        temperedAffixes: [] // No tempered affixes yet
      })
      const buildSlot = makeBuildSlot({
        temperedAffixes: [{ name: 'Maximum Life', isGreater: false }]
      })
      const verdict = compareGear(scanned, buildSlot)

      const temperRec = verdict.recommendations.find((r) => r.action === 'temper')
      expect(temperRec).toBeDefined()
      expect(temperRec!.addAffix).toBe('Maximum Life')
      expect(temperRec!.vendor).toBe('Blacksmith')
    })

    it('should not recommend tempering when all tempered slots are filled', () => {
      const scanned = makeScanned({
        temperedAffixes: ['+25% Vulnerable Damage']
      })
      const buildSlot = makeBuildSlot({
        temperedAffixes: [{ name: 'Vulnerable Damage', isGreater: false }]
      })
      const verdict = compareGear(scanned, buildSlot)

      const temperRecs = verdict.recommendations.filter((r) => r.action === 'temper')
      expect(temperRecs).toHaveLength(0)
    })

    it('should not recommend tempering when build tempered stat is already in regular affixes (OCR cannot distinguish)', () => {
      // OCR cannot tell that "+25% Core Skill Damage" is a tempered affix —
      // it always ends up in affixes[]. This should suppress the temper recommendation.
      const scanned = makeScanned({
        affixes: ['+25% Vulnerable Damage', '+10% Crit Chance'],
        temperedAffixes: [] // Always empty from OCR
      })
      const buildSlot = makeBuildSlot({
        affixes: [],
        temperedAffixes: [{ name: 'Vulnerable Damage', isGreater: false }]
      })
      const verdict = compareGear(scanned, buildSlot)

      const temperRecs = verdict.recommendations.filter((r) => r.action === 'temper')
      expect(temperRecs).toHaveLength(0)
    })
  })

  describe('scannedItem passthrough', () => {
    it('should include the original scanned item in the verdict', () => {
      const scanned = makeScanned()
      const verdict = compareGear(scanned, makeBuildSlot())

      expect(verdict.scannedItem).toEqual(scanned)
    })
  })

  describe('unified affix pool scoring', () => {
    it('should count tempered affix in build as matched when item has it in regular affixes', () => {
      // Build has Attack Speed as a tempered affix; scanned item has it in regular affixes
      const scanned = makeScanned({
        affixes: ['+9.5% Attack Speed']
      })
      const buildSlot = makeBuildSlot({
        affixes: [],
        temperedAffixes: [{ name: 'Attack Speed', isGreater: false }]
      })
      const verdict = compareGear(scanned, buildSlot)

      expect(verdict.buildMatchCount).toBe(1)
      expect(verdict.matchedAffixes).toContain('Attack Speed')
    })

    it('should count greater affix in build toward buildTotalExpected', () => {
      const buildSlot = makeBuildSlot({
        affixes: [{ name: 'Critical Strike Chance', isGreater: false }],
        greaterAffixes: [{ name: 'Vulnerable Damage', isGreater: true }]
      })
      const scanned = makeScanned({ affixes: ['+10% Critical Strike Chance'] })
      const verdict = compareGear(scanned, buildSlot)

      // totalExpected should be 2 (CSC + Vulnerable Damage from greaterAffixes)
      expect(verdict.buildTotalExpected).toBeGreaterThanOrEqual(2)
    })

    it('should match when scanned tempered affix satisfies build tempered affix requirement', () => {
      const scanned = makeScanned({
        affixes: [],
        temperedAffixes: ['+25% Vulnerable Damage']
      })
      const buildSlot = makeBuildSlot({
        affixes: [],
        temperedAffixes: [{ name: 'Vulnerable Damage', isGreater: false }]
      })
      const verdict = compareGear(scanned, buildSlot)

      expect(verdict.buildMatchCount).toBe(1)
      expect(verdict.matchedAffixes).toContain('Vulnerable Damage')
    })
  })

  describe('aspect comparison', () => {
    it('should return hasMatch: true when scanned item aspect matches build required aspect', () => {
      const scanned = makeScanned({
        aspect: { name: 'Aspect of the Dire Wolf', description: '' }
      })
      const buildSlot = makeBuildSlot({
        requiredAspect: { name: 'Dire Wolf', description: null }
      })
      const verdict = compareGear(scanned, buildSlot)

      expect(verdict.aspectComparison).not.toBeNull()
      expect(verdict.aspectComparison!.hasMatch).toBe(true)
      expect(verdict.aspectComparison!.expectedAspect).toBe('Dire Wolf')
    })

    it('should return hasMatch: false when scanned item has no aspect but build requires one', () => {
      const scanned = makeScanned({ aspect: null })
      const buildSlot = makeBuildSlot({
        requiredAspect: { name: 'Ravenous Aspect', description: null }
      })
      const verdict = compareGear(scanned, buildSlot)

      expect(verdict.aspectComparison).not.toBeNull()
      expect(verdict.aspectComparison!.hasMatch).toBe(false)
    })

    it('should generate an aspect recommendation when aspect is missing', () => {
      const scanned = makeScanned({ aspect: null })
      const buildSlot = makeBuildSlot({
        requiredAspect: { name: 'Ravenous Aspect', description: null }
      })
      const verdict = compareGear(scanned, buildSlot)

      const aspectRec = verdict.recommendations.find((r) => r.action === 'aspect')
      expect(aspectRec).toBeDefined()
      expect(aspectRec!.addAffix).toBe('Ravenous Aspect')
      expect(aspectRec!.vendor).toBe('Occultist')
    })

    it('should return aspectComparison: null when build has no required aspect', () => {
      const scanned = makeScanned({ aspect: null })
      const buildSlot = makeBuildSlot({ requiredAspect: null })
      const verdict = compareGear(scanned, buildSlot)

      expect(verdict.aspectComparison).toBeNull()
    })
  })

  describe('quick decision metadata', () => {
    it('should include required affix plan for scanned slot', () => {
      const buildSlot = makeBuildSlot({
        affixes: [{ name: 'Critical Strike Chance', isGreater: false }],
        temperedAffixes: [{ name: 'Damage while Berserking', isGreater: false }],
        masterworkPriority: ['Critical Strike Chance', 'Cooldown Reduction']
      })
      const verdict = compareGear(makeScanned(), buildSlot)

      expect(verdict.requiredAffixPlan.slot).toBe('Helm')
      expect(verdict.requiredAffixPlan.requiredAffixes).toContain('Critical Strike Chance')
      expect(verdict.requiredAffixPlan.requiredTemperedAffixes).toContain('Damage while Berserking')
      expect(verdict.requiredAffixPlan.masterworkPriority).toContain('Cooldown Reduction')
    })

    it('should generate a masterwork recommendation when masterwork priorities exist', () => {
      const verdict = compareGear(
        makeScanned(),
        makeBuildSlot({
          masterworkPriority: ['Critical Strike Chance', 'Vulnerable Damage']
        })
      )

      const masterworkRec = verdict.recommendations.find((r) => r.action === 'masterwork')
      expect(masterworkRec).toBeDefined()
      expect(masterworkRec!.addAffix).toContain('Critical Strike Chance')
      expect(masterworkRec!.vendor).toBe('Blacksmith')
    })
  })
})
