import { describe, it, expect } from 'vitest'
import { detectSite } from '../../../src/main/services/BuildImportService'

describe('BuildImportService URL routing', () => {
  it('should detect d4builds.gg URLs', () => {
    expect(detectSite('https://d4builds.gg/builds/abc123')).toBe('d4builds')
    expect(detectSite('https://www.d4builds.gg/builds/abc123')).toBe('d4builds')
    expect(detectSite('https://D4BUILDS.GG/builds/xyz')).toBe('d4builds')
  })

  it('should throw on unsupported URLs', () => {
    expect(() => detectSite('https://google.com')).toThrow('Unsupported')
    expect(() => detectSite('https://reddit.com/r/diablo4')).toThrow('Unsupported')
    expect(() => detectSite('https://maxroll.gg/d4/planner/abc')).toThrow('Unsupported')
    expect(() => detectSite('https://icy-veins.com/d4/builds/barb')).toThrow('Unsupported')
  })

  it('should handle URLs with extra whitespace', () => {
    expect(detectSite('  https://d4builds.gg/builds/abc123  ')).toBe('d4builds')
  })

  it('should throw a helpful message listing supported sites', () => {
    try {
      detectSite('https://unknown.com/build')
      expect.unreachable('Should have thrown')
    } catch (error: unknown) {
      if (error instanceof Error) {
        expect(error.message).toContain('d4builds.gg')
      } else {
        throw error
      }
    }
  })
})
