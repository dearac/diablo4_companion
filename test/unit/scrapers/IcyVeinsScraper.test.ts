import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IcyVeinsScraper } from '../../../src/main/scrapers/IcyVeinsScraper'

// Mock playwright — same pattern as MaxrollScraper and D4BuildsScraper tests
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue({
          goto: vi.fn().mockResolvedValue(null),
          waitForSelector: vi.fn().mockResolvedValue(null),
          $eval: vi.fn().mockImplementation((selector, callback) => {
            // Simulate Icy Veins' <h1> content
            return callback({ textContent: 'Heartseeker Rogue Build Guide' })
          }),
          close: vi.fn().mockResolvedValue(null)
        }),
        close: vi.fn().mockResolvedValue(null)
      }),
      close: vi.fn().mockResolvedValue(null)
    })
  }
}))

describe('IcyVeinsScraper', () => {
  let scraper: IcyVeinsScraper

  beforeEach(() => {
    scraper = new IcyVeinsScraper()
  })

  it('should have the correct site name and source key', () => {
    expect(scraper.siteName).toBe('icy-veins.com')
    expect(scraper.sourceKey).toBe('icy-veins')
  })

  it('should handle icy-veins.com/d4/ URLs', () => {
    expect(scraper.canHandle('https://www.icy-veins.com/d4/rogue-heartseeker-build')).toBe(true)
    expect(scraper.canHandle('https://icy-veins.com/d4/builds/barb')).toBe(true)
    // Should NOT match non-D4 icy-veins pages
    expect(scraper.canHandle('https://www.icy-veins.com/wow/warrior-guide')).toBe(false)
    // Should NOT match other sites
    expect(scraper.canHandle('https://maxroll.gg/d4/planner/test')).toBe(false)
    expect(scraper.canHandle('https://d4builds.gg/builds/123')).toBe(false)
  })

  it('should scrape basic metadata and infer class from title', async () => {
    const data = await scraper.scrape('https://www.icy-veins.com/d4/rogue-heartseeker-build')
    expect(data.name).toBe('Heartseeker Rogue Build Guide')
    expect(data.d4Class).toBe('Rogue')
    expect(data.level).toBe(100)
    // Metadata-only phase: these should be empty
    expect(data.skills).toEqual([])
    expect(data.paragonBoards).toEqual([])
    expect(data.gearSlots).toEqual([])
  })
})
