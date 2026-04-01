import { describe, it, expect } from 'vitest'
import { evaluatePerfectibility } from '../../../src/shared/PerfectibilityEngine'
import type { ScannedGearPiece, IGearSlot } from '../../../src/shared/types'

const makeGear = (overrides: Partial<ScannedGearPiece> = {}): ScannedGearPiece => ({
  slot: 'Helm',
  itemName: 'Test Helm',
  itemType: 'Legendary',
  itemPower: 925,
  affixes: [],
  implicitAffixes: [],
  temperedAffixes: [],
  greaterAffixes: [],
  sockets: 0,
  socketContents: [],
  aspect: null,
  rawText: '',
  ...overrides
})

const makeSlot = (overrides: Partial<IGearSlot> = {}): IGearSlot => ({
  slot: 'Helm',
  itemName: null,
  itemType: 'Legendary',
  requiredAspect: null,
  affixes: [],
  implicitAffixes: [],
  temperedAffixes: [],
  greaterAffixes: [],
  masterworkPriority: [],
  rampageEffect: null,
  feastEffect: null,
  socketedGems: [],
  ...overrides
})

describe('PerfectibilityEngine', () => {
  describe('Step 0: Power Check', () => {
    it('should NOT_PERFECTIBLE item with insufficient item power', () => {
      const item = makeGear({ itemPower: 700 })
      const slot = makeSlot({ minItemPower: 800 })
      const result = evaluatePerfectibility(item, slot)
      expect(result.overallVerdict).toBe('NOT_PERFECTIBLE')
      expect(result.steps.powerCheck?.passed).toBe(false)
    })

    it('should pass item with exactly sufficient item power', () => {
      const item = makeGear({ itemPower: 800 })
      const slot = makeSlot({ minItemPower: 800 })
      const result = evaluatePerfectibility(item, slot)
      // the test may fail later steps natively from dummy data, but powerCheck must pass
      expect(result.steps.powerCheck?.passed).toBe(true)
    })

    it('should pass item if slot has no minItemPower requirement', () => {
      const item = makeGear({ itemPower: 700 })
      const slot = makeSlot({ minItemPower: undefined })
      const result = evaluatePerfectibility(item, slot)
      expect(result.steps.powerCheck?.passed).toBe(true)
      expect(result.steps.powerCheck?.skipped).toBe(true)
    })
  })

  describe('Step 1: Bloodied Check', () => {
    it('should JUNK item missing Bloodied when build requires rampageEffect', () => {
      const item = makeGear({ itemName: 'Ancestral Helm' })
      const slot = makeSlot({ rampageEffect: 'Rampage: +20% damage' })
      const result = evaluatePerfectibility(item, slot)
      expect(result.overallVerdict).toBe('NOT_PERFECTIBLE')
      expect(result.steps.bloodied.passed).toBe(false)
    })

    it('should PASS Bloodied when item name contains Bloodied', () => {
      const item = makeGear({ itemName: 'Bloodied Ancestral Helm' })
      const slot = makeSlot({ rampageEffect: 'Rampage: +20% damage' })
      const result = evaluatePerfectibility(item, slot)
      expect(result.steps.bloodied.passed).toBe(true)
    })

    it('should SKIP Bloodied when build has no killstreak requirement', () => {
      const item = makeGear({ itemName: 'Ancestral Helm' })
      const slot = makeSlot({ rampageEffect: null, feastEffect: null })
      const result = evaluatePerfectibility(item, slot)
      expect(result.steps.bloodied.passed).toBe(true)
      expect(result.steps.bloodied.skipped).toBe(true)
    })
  })

  describe('Step 2: Base Affix Foundation (2/3 Rule)', () => {
    it('should mark PERFECTIBLE when 3/3 base affixes match', () => {
      const item = makeGear({
        affixes: ['+10% Crit Chance', '+5% CDR', '+100 Strength']
      })
      const slot = makeSlot({
        affixes: [
          { name: 'Crit Chance', isGreater: false },
          { name: 'CDR', isGreater: false },
          { name: 'Strength', isGreater: false }
        ]
      })
      const result = evaluatePerfectibility(item, slot)
      expect(result.steps.baseAffixes.matchCount).toBe(3)
      expect(result.steps.baseAffixes.passed).toBe(true)
    })

    it('should mark rerollable when 2/3 base affixes match', () => {
      const item = makeGear({
        affixes: ['+10% Crit Chance', '+5% CDR', '+100 Thorns']
      })
      const slot = makeSlot({
        affixes: [
          { name: 'Crit Chance', isGreater: false },
          { name: 'CDR', isGreater: false },
          { name: 'Strength', isGreater: false }
        ]
      })
      const result = evaluatePerfectibility(item, slot)
      expect(result.steps.baseAffixes.matchCount).toBe(2)
      expect(result.steps.baseAffixes.passed).toBe(true)
      expect(result.steps.baseAffixes.rerollTarget).toBeTruthy()
    })

    it('should JUNK when only 1/3 base affixes match', () => {
      const item = makeGear({
        affixes: ['+10% Crit Chance', '+100 Thorns', '+50 Life Regen']
      })
      const slot = makeSlot({
        affixes: [
          { name: 'Crit Chance', isGreater: false },
          { name: 'CDR', isGreater: false },
          { name: 'Strength', isGreater: false }
        ]
      })
      const result = evaluatePerfectibility(item, slot)
      expect(result.steps.baseAffixes.matchCount).toBe(1)
      expect(result.steps.baseAffixes.passed).toBe(false)
      expect(result.overallVerdict).toBe('NOT_PERFECTIBLE')
    })

    it('should be RISKY if rolled stats are beneath minValue thresholds', () => {
      const item = makeGear({
        affixes: ['+300 Maximum Life', '+5% CDR', '+100 Strength']
      })
      const slot = makeSlot({
        affixes: [
          { name: 'Maximum Life', isGreater: false, minValue: 400 },
          { name: 'CDR', isGreater: false },
          { name: 'Strength', isGreater: false }
        ]
      })
      const result = evaluatePerfectibility(item, slot)
      // Match count is still 3/3 for base affixes, but overall is RISKY
      expect(result.steps.baseAffixes.matchCount).toBe(3)
      expect(result.steps.baseAffixes.passed).toBe(false)
      expect(result.overallVerdict).toBe('NOT_PERFECTIBLE') // because the threshold fails baseAffixes step according to the plan
    })
  })

  describe('Step 3: Greater Affix Check', () => {
    it('should flag missing expected GA as not perfectible', () => {
      const item = makeGear({
        affixes: ['+10% Crit Chance', '+5% CDR', '+100 Strength'],
        greaterAffixes: []
      })
      const slot = makeSlot({
        affixes: [
          { name: 'Crit Chance', isGreater: false },
          { name: 'CDR', isGreater: false },
          { name: 'Strength', isGreater: false }
        ],
        greaterAffixes: [{ name: 'Crit Chance', isGreater: true }]
      })
      const result = evaluatePerfectibility(item, slot)
      expect(result.steps.greaterAffixes.passed).toBe(false)
      expect(result.steps.greaterAffixes.missingGA).toContain('Crit Chance')
    })
  })

  describe('Step 4: Tempering Forecast', () => {
    it('should list missing tempered affixes', () => {
      const item = makeGear({
        affixes: ['+10% Crit Chance', '+5% CDR', '+100 Strength']
      })
      const slot = makeSlot({
        affixes: [
          { name: 'Crit Chance', isGreater: false },
          { name: 'CDR', isGreater: false },
          { name: 'Strength', isGreater: false }
        ],
        temperedAffixes: [
          { name: 'Lucky Hit Chance', isGreater: false },
          { name: 'Damage to CC', isGreater: false }
        ]
      })
      const result = evaluatePerfectibility(item, slot)
      expect(result.steps.tempering.missingTempers).toHaveLength(2)
      expect(result.steps.tempering.passed).toBe(false)
    })

    it('should pass when all tempers already present', () => {
      const item = makeGear({
        affixes: ['+10% Crit Chance', '+5% CDR', '+100 Strength'],
        temperedAffixes: ['+5% Lucky Hit Chance', '+10% Damage to CC']
      })
      const slot = makeSlot({
        affixes: [
          { name: 'Crit Chance', isGreater: false },
          { name: 'CDR', isGreater: false },
          { name: 'Strength', isGreater: false }
        ],
        temperedAffixes: [
          { name: 'Lucky Hit Chance', isGreater: false },
          { name: 'Damage to CC', isGreater: false }
        ]
      })
      const result = evaluatePerfectibility(item, slot)
      expect(result.steps.tempering.missingTempers).toHaveLength(0)
      expect(result.steps.tempering.passed).toBe(true)
    })
  })

  describe('Overall Verdict', () => {
    it('should be PERFECTIBLE when all steps pass including tempering', () => {
      const item = makeGear({
        affixes: ['+10% Crit Chance', '+5% CDR', '+100 Strength'],
        temperedAffixes: ['+5% Lucky Hit Chance'],
        greaterAffixes: ['+25% Crit Chance']
      })
      const slot = makeSlot({
        affixes: [
          { name: 'Crit Chance', isGreater: false },
          { name: 'CDR', isGreater: false },
          { name: 'Strength', isGreater: false }
        ],
        temperedAffixes: [{ name: 'Lucky Hit Chance', isGreater: false }],
        greaterAffixes: [{ name: 'Crit Chance', isGreater: true }]
      })
      const result = evaluatePerfectibility(item, slot)
      expect(result.overallVerdict).toBe('PERFECTIBLE')
    })

    it('should be RISKY when base passes but tempering still needed', () => {
      const item = makeGear({
        affixes: ['+10% Crit Chance', '+5% CDR', '+100 Strength']
      })
      const slot = makeSlot({
        affixes: [
          { name: 'Crit Chance', isGreater: false },
          { name: 'CDR', isGreater: false },
          { name: 'Strength', isGreater: false }
        ],
        temperedAffixes: [{ name: 'Lucky Hit Chance', isGreater: false }]
      })
      const result = evaluatePerfectibility(item, slot)
      expect(result.overallVerdict).toBe('RISKY')
    })
  })
})
