import { describe, it, expect } from 'vitest'
import { sanitizeGreaterAffix } from '../../../src/main/services/GearParser'

describe('sanitizeGreaterAffix', () => {
  describe('should detect GA markers', () => {
    it('detects ✦ (diamond star) at start', () => {
      const result = sanitizeGreaterAffix('✦ +150 Max Life')
      expect(result.isGreater).toBe(true)
      expect(result.cleaned).toBe('+150 Max Life')
    })

    it('detects ✦ between + and value', () => {
      const result = sanitizeGreaterAffix('+ ✦ 150 Max Life')
      expect(result.isGreater).toBe(true)
      expect(result.cleaned).toBe('+ 150 Max Life')
    })

    it('detects * (asterisk) merged into value', () => {
      const result = sanitizeGreaterAffix('*+150 Max Life')
      expect(result.isGreater).toBe(true)
      expect(result.cleaned).toBe('+150 Max Life')
    })

    it('detects ♦ (black diamond) before percentage', () => {
      const result = sanitizeGreaterAffix('♦+15.5% Critical Strike Chance')
      expect(result.isGreater).toBe(true)
      expect(result.cleaned).toBe('+15.5% Critical Strike Chance')
    })

    it('detects ✧ (open star) before multiplicative prefix', () => {
      const result = sanitizeGreaterAffix('✧ ×12% Vulnerable Damage')
      expect(result.isGreater).toBe(true)
      expect(result.cleaned).toBe('×12% Vulnerable Damage')
    })

    it('detects ★ (filled star)', () => {
      const result = sanitizeGreaterAffix('★ +100 Thorns')
      expect(result.isGreater).toBe(true)
      expect(result.cleaned).toBe('+100 Thorns')
    })

    it('detects ☆ (outlined star)', () => {
      const result = sanitizeGreaterAffix('☆ +100 Thorns')
      expect(result.isGreater).toBe(true)
      expect(result.cleaned).toBe('+100 Thorns')
    })

    it('detects ⭐ (star emoji)', () => {
      const result = sanitizeGreaterAffix('⭐ +100 Thorns')
      expect(result.isGreater).toBe(true)
      expect(result.cleaned).toBe('+100 Thorns')
    })

    it('detects "Greater" keyword', () => {
      const result = sanitizeGreaterAffix('Greater +100 Thorns')
      expect(result.isGreater).toBe(true)
      expect(result.cleaned).toBe('+100 Thorns')
    })

    it('detects ◆ (black diamond)', () => {
      const result = sanitizeGreaterAffix('◆ +50 Willpower')
      expect(result.isGreater).toBe(true)
      expect(result.cleaned).toBe('+50 Willpower')
    })

    it('detects ❖ (four diamond)', () => {
      const result = sanitizeGreaterAffix('❖ +50 Willpower')
      expect(result.isGreater).toBe(true)
      expect(result.cleaned).toBe('+50 Willpower')
    })
  })

  describe('should NOT detect GA on normal affixes', () => {
    it('leaves normal additive affix unchanged', () => {
      const result = sanitizeGreaterAffix('+100 Thorns')
      expect(result.isGreater).toBe(false)
      expect(result.cleaned).toBe('+100 Thorns')
    })

    it('leaves normal percentage affix unchanged', () => {
      const result = sanitizeGreaterAffix('+15.5% Critical Strike Chance')
      expect(result.isGreater).toBe(false)
      expect(result.cleaned).toBe('+15.5% Critical Strike Chance')
    })

    it('leaves normal multiplicative affix unchanged', () => {
      const result = sanitizeGreaterAffix('×12% Vulnerable Damage')
      expect(result.isGreater).toBe(false)
      expect(result.cleaned).toBe('×12% Vulnerable Damage')
    })

    it('leaves bare percentage affix unchanged', () => {
      const result = sanitizeGreaterAffix('10.8% Cooldown Reduction')
      expect(result.isGreater).toBe(false)
      expect(result.cleaned).toBe('10.8% Cooldown Reduction')
    })
  })

  describe('should collapse whitespace from removed characters', () => {
    it('collapses double spaces after removal', () => {
      const result = sanitizeGreaterAffix('+  ✦  150 Max Life')
      expect(result.isGreater).toBe(true)
      expect(result.cleaned).toBe('+ 150 Max Life')
    })
  })
})
