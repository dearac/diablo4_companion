import { describe, it, expect } from 'vitest'
import { BuildImportService } from '../../../src/main/services/BuildImportService'

describe('BuildImportService URL routing', () => {
  const service = new BuildImportService()

  it('should detect d4builds.gg URLs', () => {
    expect(service.detectSite('https://d4builds.gg/builds/abc123')).toBe('d4builds')
    expect(service.detectSite('https://www.d4builds.gg/builds/abc123')).toBe('d4builds')
    expect(service.detectSite('https://D4BUILDS.GG/builds/xyz')).toBe('d4builds')
  })

  it('should detect maxroll.gg URLs', () => {
    expect(service.detectSite('https://maxroll.gg/d4/planner/abc')).toBe('maxroll')
    expect(service.detectSite('https://www.maxroll.gg/d4/planner/abc')).toBe('maxroll')
  })

  it('should detect icy-veins.com URLs', () => {
    expect(service.detectSite('https://www.icy-veins.com/d4/builds/barb')).toBe('icy-veins')
    expect(service.detectSite('https://icy-veins.com/d4/some-build')).toBe('icy-veins')
  })

  it('should throw on unsupported URLs', () => {
    expect(() => service.detectSite('https://google.com')).toThrow('Unsupported')
    expect(() => service.detectSite('https://reddit.com/r/diablo4')).toThrow('Unsupported')
  })

  it('should handle URLs with extra whitespace', () => {
    expect(service.detectSite('  https://d4builds.gg/builds/abc123  ')).toBe('d4builds')
  })

  it('should throw a helpful message listing supported sites', () => {
    try {
      service.detectSite('https://unknown.com/build')
      expect.unreachable('Should have thrown')
    } catch (error: unknown) {
      if (error instanceof Error) {
        expect(error.message).toContain('d4builds.gg')
        expect(error.message).toContain('maxroll.gg')
        expect(error.message).toContain('icy-veins.com')
      } else {
        throw error
      }
    }
  })
})
