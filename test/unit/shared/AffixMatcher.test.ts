import { describe, it, expect } from 'vitest'
import { affixMatches } from '../../../src/shared/AffixMatcher'

describe('AffixMatcher', () => {
  it('should match normal affix strings', () => {
    expect(affixMatches('+121 Strength [88-102]', '[133-151] Strength')).toBe(true)
    expect(affixMatches('+9.5% Attack Speed [8.3-', '22% Attack Speed')).toBe(true)
  })

  it('should NOT match completely different affixes', () => {
    expect(affixMatches('+100 Maximum Life', 'Critical Strike Chance')).toBe(false)
  })

  it('should match OCR-merged "AllStats" against build "All Stats"', () => {
    // OCR reads "+10 AllStats" (no space), build expects "[63-81] All Stats" (with space)
    expect(affixMatches('+10 AllStats', '[63-81] All Stats')).toBe(true)
  })

  it('should match with extra whitespace in OCR', () => {
    expect(affixMatches('+10   All  Stats', '[63-81] All Stats')).toBe(true)
  })
})
