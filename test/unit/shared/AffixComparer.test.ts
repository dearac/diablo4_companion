import { describe, it, expect } from 'vitest'
import { compareAffixes } from '../../../src/shared/AffixComparer'

describe('AffixComparer', () => {
  describe('Layer 1: Exact canonical match', () => {
    it('should match identical stat names', () => {
      const result = compareAffixes('+121 Strength', '[133-151] Strength')
      expect(result.matched).toBe(true)
      expect(result.confidence).toBe(1.0)
      expect(result.method).toBe('exact')
    })
  })

  describe('Layer 2: Alias match', () => {
    it('should match alias to canonical name', () => {
      const result = compareAffixes('+10% Crit Chance', 'Critical Strike Chance')
      expect(result.matched).toBe(true)
      expect(result.confidence).toBe(0.9)
      expect(result.method).toBe('alias')
    })

    it('should match CDR abbreviation', () => {
      const result = compareAffixes('+5% CDR', 'Cooldown Reduction')
      expect(result.matched).toBe(true)
    })
  })

  describe('Layer 3: Token overlap match', () => {
    it('should match when tokens overlap ≥80%', () => {
      const result = compareAffixes('Attack Speed', 'Basic Attack Speed')
      expect(result.matched).toBe(true)
      expect(result.confidence).toBeCloseTo(0.75, 1)
    })

    it('should NOT match single-token overlap (guard: min 2 tokens)', () => {
      // "Life" has only 1 token overlapping with "Life on Kill"
      const result = compareAffixes('+100 Life', 'Life on Kill')
      expect(result.matched).toBe(false)
    })
  })

  describe('True negatives', () => {
    it('should NOT match completely different stats', () => {
      expect(compareAffixes('+100 Strength', 'Intelligence').matched).toBe(false)
      expect(compareAffixes('+10% Attack Speed', 'Movement Speed').matched).toBe(false)
      expect(compareAffixes('+100 Maximum Life', 'Critical Strike Chance').matched).toBe(false)
    })
  })

  describe('Edge cases', () => {
    it('should handle empty strings', () => {
      expect(compareAffixes('', 'Strength').matched).toBe(false)
      expect(compareAffixes('Strength', '').matched).toBe(false)
    })

    it('should match OCR-merged AllStats', () => {
      const result = compareAffixes('+10 AllStats', '[63-81] All Stats')
      expect(result.matched).toBe(true)
    })

    it('should provide a reason string', () => {
      const result = compareAffixes('+121 Strength', '[133-151] Strength')
      expect(result.reason).toBeTruthy()
      expect(typeof result.reason).toBe('string')
    })
  })
})
