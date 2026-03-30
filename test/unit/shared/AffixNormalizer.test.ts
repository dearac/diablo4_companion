import { describe, it, expect } from 'vitest'
import { normalizeAffix } from '../../../src/shared/AffixNormalizer'

describe('AffixNormalizer', () => {
  describe('numeric value extraction', () => {
    it('should extract integer value from additive affix', () => {
      const result = normalizeAffix('+121 Strength [88-102]')
      expect(result.value).toBe(121)
      expect(result.isPercent).toBe(false)
    })

    it('should extract percentage value', () => {
      const result = normalizeAffix('+9.5% Attack Speed [8.3-')
      expect(result.value).toBe(9.5)
      expect(result.isPercent).toBe(true)
    })

    it('should handle bare percentage prefix', () => {
      const result = normalizeAffix('13% Critical Strike Chance')
      expect(result.value).toBe(13)
      expect(result.isPercent).toBe(true)
    })

    it('should handle multiplicative prefix', () => {
      const result = normalizeAffix('×12% Vulnerable Damage')
      expect(result.value).toBe(12)
      expect(result.isPercent).toBe(true)
    })
  })

  describe('range extraction', () => {
    it('should extract trailing range brackets', () => {
      const result = normalizeAffix('+121 Strength [88-102]')
      expect(result.range).toEqual([88, 102])
    })

    it('should extract leading range brackets (build format)', () => {
      const result = normalizeAffix('[133-151] Strength')
      expect(result.range).toEqual([133, 151])
    })

    it('should handle truncated range from OCR', () => {
      const result = normalizeAffix('+9.5% Attack Speed [8.3-')
      // Truncated range — value extracted as null since incomplete
      expect(result.range).toBeNull()
    })
  })

  describe('canonical name resolution', () => {
    it('should resolve exact name', () => {
      const result = normalizeAffix('+121 Strength [88-102]')
      expect(result.canonicalName).toBe('Strength')
      expect(result.matchMethod).toBe('exact')
      expect(result.confidence).toBe(1.0)
    })

    it('should resolve via alias', () => {
      const result = normalizeAffix('+10% Crit Chance')
      expect(result.canonicalName).toBe('Critical Strike Chance')
      expect(result.matchMethod).toBe('alias')
      expect(result.confidence).toBe(0.9)
    })

    it('should resolve OCR-merged words', () => {
      const result = normalizeAffix('+10 AllStats')
      expect(result.canonicalName).toBe('All Stats')
    })

    it('should resolve build-format affixes with leading ranges', () => {
      const result = normalizeAffix('[133-151] Strength')
      expect(result.canonicalName).toBe('Strength')
    })

    it('should resolve percentage build affixes', () => {
      const result = normalizeAffix('22% Attack Speed')
      expect(result.canonicalName).toBe('Attack Speed')
    })

    it('should mark unresolvable affixes', () => {
      const result = normalizeAffix('xj39dk garbage text')
      expect(result.canonicalName).toBeNull()
      expect(result.matchMethod).toBe('unresolved')
    })
  })

  describe('raw preservation', () => {
    it('should preserve the original raw string', () => {
      const result = normalizeAffix('+121 Strength [88-102]')
      expect(result.raw).toBe('+121 Strength [88-102]')
    })
  })
})
