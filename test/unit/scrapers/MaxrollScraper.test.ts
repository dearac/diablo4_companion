import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MaxrollScraper } from '../../../src/main/scrapers/MaxrollScraper'

// Mock playwright
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue({
          goto: vi.fn().mockResolvedValue(null),
          waitForSelector: vi.fn().mockResolvedValue(null),
          $eval: vi.fn().mockImplementation((selector, callback) => {
            if (selector.includes('buildTitle')) return callback({ textContent: 'Test Build' })
            if (selector.includes('SelectValue')) return callback({ textContent: 'Spiritborn' })
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

describe('MaxrollScraper', () => {
  let scraper: MaxrollScraper

  beforeEach(() => {
    scraper = new MaxrollScraper()
  })

  it('should have the correct site name and source key', () => {
    expect(scraper.siteName).toBe('maxroll.gg')
    expect(scraper.sourceKey).toBe('maxroll')
  })

  it('should handle maxroll planner URLs', () => {
    expect(scraper.canHandle('https://maxroll.gg/d4/planner/abc123')).toBe(true)
    expect(scraper.canHandle('https://www.maxroll.gg/d4/planner/xyz')).toBe(true)
    expect(scraper.canHandle('https://d4builds.gg/builds/123')).toBe(false)
  })

  it('should scrape basic metadata', async () => {
    const data = await scraper.scrape('https://maxroll.gg/d4/planner/test')
    expect(data.name).toBe('Test Build')
    expect(data.d4Class).toBe('Spiritborn')
    expect(data.level).toBe(100)
  })
})
