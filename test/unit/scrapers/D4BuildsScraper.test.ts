import { describe, it, expect, vi, beforeEach } from 'vitest'
import { D4BuildsScraper } from '../../../src/main/scrapers/D4BuildsScraper'

// Mock playwright
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue({
          goto: vi.fn().mockResolvedValue(null),
          waitForSelector: vi.fn().mockResolvedValue(null),
          $eval: vi.fn().mockImplementation((selector, callback) => {
            if (selector.includes('description')) return callback({ textContent: "Rob's Cpt. America" })
            if (selector.includes('header__title')) return callback({ textContent: 'Blessed Shield Paladin Build' })
            return null
          }),
          close: vi.fn().mockResolvedValue(null)
        }),
        close: vi.fn().mockResolvedValue(null)
      }),
      close: vi.fn().mockResolvedValue(null)
    })
  }
}))

describe('D4BuildsScraper', () => {
  let scraper: D4BuildsScraper

  beforeEach(() => {
    scraper = new D4BuildsScraper()
  })

  it('should have the correct site name and source key', () => {
    expect(scraper.siteName).toBe('d4builds.gg')
    expect(scraper.sourceKey).toBe('d4builds')
  })

  it('should handle d4builds.gg URLs', () => {
    expect(scraper.canHandle('https://d4builds.gg/builds/abc123')).toBe(true)
    expect(scraper.canHandle('https://www.d4builds.gg/builds/xyz')).toBe(true)
    expect(scraper.canHandle('https://maxroll.gg/d4/planner/test')).toBe(false)
  })

  it('should scrape basic metadata', async () => {
    const data = await scraper.scrape('https://d4builds.gg/builds/test')
    expect(data.name).toBe("Rob's Cpt. America")
    // Fallback for Paladin
    expect(data.d4Class).toBe('Barbarian')
    expect(data.level).toBe(100)
  })
})
