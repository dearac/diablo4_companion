import { describe, it, expect } from 'vitest'
import { computeBuildAnalysis } from '../../../src/shared/BuildAnalyzer'
import type { ScannedGearPiece, IGearSlot } from '../../../src/shared/types'

const makeGear = (slot: string, affixes: string[]): ScannedGearPiece => ({
  slot,
  itemName: `Test ${slot}`,
  itemType: 'Legendary',
  itemPower: 925,
  affixes,
  implicitAffixes: [],
  temperedAffixes: [],
  greaterAffixes: [],
  sockets: 0,
  socketContents: [],
  aspect: null,
  rawText: ''
})

const makeSlot = (slot: string, affixNames: string[]): IGearSlot => ({
  slot,
  itemName: null,
  itemType: 'Legendary',
  requiredAspect: null,
  affixes: affixNames.map((n) => ({ name: n, isGreater: false })),
  implicitAffixes: [],
  temperedAffixes: [],
  greaterAffixes: [],
  masterworkPriority: [],
  rampageEffect: null,
  feastEffect: null,
  socketedGems: []
})

describe('BuildAnalyzer', () => {
  it('should compute 100% overall when all slots are perfect', () => {
    const equipped = {
      Helm: makeGear('Helm', ['+10% Critical Strike Chance', '+5% Cooldown Reduction'])
    }
    const buildSlots: IGearSlot[] = [
      makeSlot('Helm', ['Critical Strike Chance', 'Cooldown Reduction'])
    ]
    const analysis = computeBuildAnalysis(equipped, buildSlots)

    expect(analysis.overallPercent).toBe(100)
    expect(analysis.slotBreakdown).toHaveLength(1)
    expect(analysis.slotBreakdown[0].matchPercent).toBe(100)
  })

  it('should rank weakest slots first in breakdown', () => {
    const equipped = {
      Helm: makeGear('Helm', ['+10% Critical Strike Chance']),
      Gloves: makeGear('Gloves', ['+5% Attack Speed', '+10% Crit Damage'])
    }
    const buildSlots: IGearSlot[] = [
      makeSlot('Helm', ['Critical Strike Chance', 'Cooldown Reduction', 'Life']),
      makeSlot('Gloves', ['Attack Speed', 'Crit Damage'])
    ]
    const analysis = computeBuildAnalysis(equipped, buildSlots)

    // Helm = 1/3 = 33%, Gloves = 2/2 = 100%
    // Weakest first
    expect(analysis.slotBreakdown[0].slot).toBe('Helm')
    expect(analysis.slotBreakdown[1].slot).toBe('Gloves')
  })

  it('should sort globalActionQueue by priority descending', () => {
    const equipped = {
      Helm: makeGear('Helm', ['+100 Thorns'])
    }
    const buildSlots: IGearSlot[] = [
      makeSlot('Helm', ['Critical Strike Chance', 'Cooldown Reduction'])
    ]
    const analysis = computeBuildAnalysis(equipped, buildSlots)

    expect(analysis.globalActionQueue.length).toBeGreaterThan(0)
    for (let i = 1; i < analysis.globalActionQueue.length; i++) {
      expect(analysis.globalActionQueue[i - 1].priority).toBeGreaterThanOrEqual(
        analysis.globalActionQueue[i].priority
      )
    }
  })

  it('should handle empty equipped gear', () => {
    const analysis = computeBuildAnalysis({}, [makeSlot('Helm', ['Crit Chance'])])
    expect(analysis.overallPercent).toBe(0)
    expect(analysis.slotBreakdown).toHaveLength(1)
    expect(analysis.slotBreakdown[0].matchPercent).toBe(0)
  })

  it('should include slot name in globalActionQueue entries', () => {
    const equipped = {
      Helm: makeGear('Helm', ['+100 Thorns'])
    }
    const buildSlots: IGearSlot[] = [makeSlot('Helm', ['Critical Strike Chance'])]
    const analysis = computeBuildAnalysis(equipped, buildSlots)

    expect(analysis.globalActionQueue.length).toBeGreaterThan(0)
    expect(analysis.globalActionQueue[0].slot).toBe('Helm')
  })

  it('should set verdict to EMPTY for unscanned slots', () => {
    const analysis = computeBuildAnalysis({}, [makeSlot('Boots', ['Movement Speed'])])

    expect(analysis.slotBreakdown[0].verdict).toBe('EMPTY')
    expect(analysis.slotBreakdown[0].totalExpected).toBe(1)
  })
})
