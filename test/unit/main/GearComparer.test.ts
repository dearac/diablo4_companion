import { describe, it, expect } from 'vitest'
import { compareGear } from '../../../src/main/services/GearComparer'
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
      const verdict = compareGear(makeScanned(), makeBuildSlot(), null)

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
      const verdict = compareGear(scanned, makeBuildSlot(), null)

      expect(verdict.extraAffixes).toContain('+100 Thorns')
      expect(verdict.extraAffixes).toContain('+5 Strength')
    })

    it('should return 100% match when all affixes present', () => {
      const scanned = makeScanned({
        affixes: [
          '+10% Critical Strike Chance',
          '+12% Vulnerable Damage',
          '+8% Cooldown Reduction'
        ]
      })
      const verdict = compareGear(scanned, makeBuildSlot(), null)

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
      const verdict = compareGear(scanned, buildSlot, null)

      expect(verdict.buildMatchCount).toBe(1)
      expect(verdict.matchedAffixes).toContain('Critical Strike Chance')
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
      const verdict = compareGear(scanned, makeBuildSlot(), null)

      expect(verdict.verdict).toBe('PERFECT')
    })

    it('should return UPGRADE at 90%+ match', () => {
      // 9 out of 10 affixes
      const affixes = Array.from({ length: 10 }, (_, i) => ({ name: `Affix${i}`, isGreater: false }))
      const scannedAffixes = affixes.slice(0, 9).map(a => `+10% ${a.name}`)
      const scanned = makeScanned({ affixes: scannedAffixes })
      const buildSlot = makeBuildSlot({ affixes })
      const verdict = compareGear(scanned, buildSlot, null)

      expect(verdict.verdict).toBe('UPGRADE')
    })

    it('should return SIDEGRADE at 60-89% match', () => {
      const verdict = compareGear(makeScanned(), makeBuildSlot(), null)
      // 2/3 = 66.7%
      expect(verdict.verdict).toBe('SIDEGRADE')
    })

    it('should return DOWNGRADE below 60% match', () => {
      const scanned = makeScanned({
        affixes: ['+100 Thorns'] // 0 matches out of 3 expected
      })
      const verdict = compareGear(scanned, makeBuildSlot(), null)

      expect(verdict.verdict).toBe('DOWNGRADE')
    })
  })

  describe('socket handling', () => {
    it('should flag missing sockets', () => {
      const scanned = makeScanned({ sockets: 0 })
      const buildSlot = makeBuildSlot({ socketedGems: ['Royal Ruby'] })
      const verdict = compareGear(scanned, buildSlot, null)

      expect(verdict.socketDelta).toBe(-1)
      expect(verdict.recommendations.some(r => r.action === 'socket')).toBe(true)
    })

    it('should not recommend sockets when count matches', () => {
      const scanned = makeScanned({ sockets: 1 })
      const buildSlot = makeBuildSlot({ socketedGems: ['Royal Ruby'] })
      const verdict = compareGear(scanned, buildSlot, null)

      expect(verdict.socketDelta).toBe(0)
      expect(verdict.recommendations.some(r => r.action === 'socket')).toBe(false)
    })

    it('should handle builds with no socket requirements', () => {
      const scanned = makeScanned({ sockets: 0 })
      const buildSlot = makeBuildSlot({ socketedGems: [] })
      const verdict = compareGear(scanned, buildSlot, null)

      expect(verdict.socketDelta).toBe(0)
    })
  })

  describe('enchant recommendations', () => {
    it('should recommend enchanting when 1 affix is expendable', () => {
      const scanned = makeScanned({
        affixes: ['+10% Critical Strike Chance', '+100 Thorns']
      })
      const verdict = compareGear(scanned, makeBuildSlot(), null)

      const enchantRec = verdict.recommendations.find(r => r.action === 'enchant')
      expect(enchantRec).toBeDefined()
      expect(enchantRec!.removeAffix).toBe('+100 Thorns')
    })

    it('should never recommend rerolling a greater affix', () => {
      const scanned = makeScanned({
        affixes: ['+10% Critical Strike Chance', '+100 Thorns'],
        greaterAffixes: ['Thorns']
      })
      const verdict = compareGear(scanned, makeBuildSlot(), null)

      const enchantRecs = verdict.recommendations.filter(r => r.action === 'enchant')
      for (const rec of enchantRecs) {
        // The removeAffix should never be a greater affix
        expect(rec.removeAffix).not.toContain('Thorns')
      }
    })

    it('should not recommend enchanting when all affixes match build', () => {
      const scanned = makeScanned({
        affixes: [
          '+10% Critical Strike Chance',
          '+12% Vulnerable Damage',
          '+8% Cooldown Reduction'
        ]
      })
      const verdict = compareGear(scanned, makeBuildSlot(), null)

      const enchantRecs = verdict.recommendations.filter(r => r.action === 'enchant')
      expect(enchantRecs).toHaveLength(0)
    })

    it('should suggest the most impactful missing affix for enchanting', () => {
      // Item has 1 match, 1 expendable, missing 2 from build
      const scanned = makeScanned({
        affixes: ['+10% Critical Strike Chance', '+100 Thorns']
      })
      const verdict = compareGear(scanned, makeBuildSlot(), null)

      const enchantRec = verdict.recommendations.find(r => r.action === 'enchant')
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
      const verdict = compareGear(scanned, makeBuildSlot(), null)

      expect(verdict.greaterAffixCount).toBe(2)
    })
  })

  describe('equipped gear comparison', () => {
    it('should return UPGRADE when scanned beats equipped', () => {
      const scanned = makeScanned({
        affixes: ['+10% Critical Strike Chance', '+12% Vulnerable Damage']
      })
      const equipped = makeScanned({
        affixes: ['+5 Strength']
      })
      const verdict = compareGear(scanned, makeBuildSlot(), equipped)

      expect(verdict.equippedComparison).not.toBeNull()
      expect(verdict.equippedComparison!.isUpgrade).toBe(true)
    })

    it('should return downgrade when scanned is worse than equipped', () => {
      const scanned = makeScanned({
        affixes: ['+5 Strength'] // 0 matches
      })
      const equipped = makeScanned({
        affixes: ['+10% Critical Strike Chance', '+12% Vulnerable Damage'] // 2 matches
      })
      const verdict = compareGear(scanned, makeBuildSlot(), equipped)

      expect(verdict.equippedComparison).not.toBeNull()
      expect(verdict.equippedComparison!.isUpgrade).toBe(false)
    })

    it('should return null equippedComparison when no equipped item', () => {
      const verdict = compareGear(makeScanned(), makeBuildSlot(), null)

      expect(verdict.equippedComparison).toBeNull()
    })

    it('should include equipped match count for comparison', () => {
      const scanned = makeScanned({
        affixes: ['+10% Critical Strike Chance', '+12% Vulnerable Damage']
      })
      const equipped = makeScanned({
        affixes: ['+10% Critical Strike Chance']
      })
      const verdict = compareGear(scanned, makeBuildSlot(), equipped)

      expect(verdict.equippedComparison!.equippedMatchCount).toBe(1)
    })
  })

  describe('temper recommendations', () => {
    it('should recommend tempering when tempered affix slots are available', () => {
      const scanned = makeScanned({
        temperedAffixes: [] // No tempered affixes yet
      })
      const buildSlot = makeBuildSlot({
        temperedAffixes: [{ name: 'Core Skill Damage', isGreater: false }]
      })
      const verdict = compareGear(scanned, buildSlot, null)

      const temperRec = verdict.recommendations.find(r => r.action === 'temper')
      expect(temperRec).toBeDefined()
      expect(temperRec!.addAffix).toBe('Core Skill Damage')
      expect(temperRec!.vendor).toBe('Blacksmith')
    })

    it('should not recommend tempering when all tempered slots are filled', () => {
      const scanned = makeScanned({
        temperedAffixes: ['+25% Core Skill Damage']
      })
      const buildSlot = makeBuildSlot({
        temperedAffixes: [{ name: 'Core Skill Damage', isGreater: false }]
      })
      const verdict = compareGear(scanned, buildSlot, null)

      const temperRecs = verdict.recommendations.filter(r => r.action === 'temper')
      expect(temperRecs).toHaveLength(0)
    })
  })

  describe('scannedItem passthrough', () => {
    it('should include the original scanned item in the verdict', () => {
      const scanned = makeScanned()
      const verdict = compareGear(scanned, makeBuildSlot(), null)

      expect(verdict.scannedItem).toEqual(scanned)
    })
  })
})
