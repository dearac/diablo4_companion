import { describe, it, expect } from 'vitest'
import { resolveCanonicalName, getAllCanonicalNames } from '../../../src/shared/AffixCanon'

describe('AffixCanon', () => {
  describe('resolveCanonicalName', () => {
    it('should resolve exact canonical name', () => {
      expect(resolveCanonicalName('Strength')).toBe('Strength')
    })

    it('should resolve lowercase alias', () => {
      expect(resolveCanonicalName('crit chance')).toBe('Critical Strike Chance')
    })

    it('should resolve abbreviation', () => {
      expect(resolveCanonicalName('CDR')).toBe('Cooldown Reduction')
    })

    it('should resolve OCR-merged words', () => {
      expect(resolveCanonicalName('AllStats')).toBe('All Stats')
    })

    it('should return null for unknown affix', () => {
      expect(resolveCanonicalName('xj39dk garbage')).toBeNull()
    })

    it('should be case-insensitive', () => {
      expect(resolveCanonicalName('STRENGTH')).toBe('Strength')
      expect(resolveCanonicalName('cRiT cHaNcE')).toBe('Critical Strike Chance')
    })
  })

  describe('getAllCanonicalNames', () => {
    it('should return a non-empty array of unique names', () => {
      const names = getAllCanonicalNames()
      expect(names.length).toBeGreaterThan(0)
      expect(new Set(names).size).toBe(names.length)
    })
  })

  describe('alias table integrity', () => {
    it('every canonical name should be resolvable to itself', () => {
      const names = getAllCanonicalNames()
      for (const name of names) {
        expect(resolveCanonicalName(name)).toBe(name)
      }
    })
  })
})
