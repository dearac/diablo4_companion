import { describe, it, expect } from 'vitest'
import { MaxrollScraper } from '../../../src/main/scrapers/MaxrollScraper'

describe('MaxrollScraper', () => {
  const scraper = new MaxrollScraper()

  it('should have the correct site name and source key', () => {
    expect(scraper.siteName).toBe('maxroll.gg')
    expect(scraper.sourceKey).toBe('maxroll')
  })

  it('should handle maxroll planner URLs', () => {
    expect(scraper.canHandle('https://maxroll.gg/d4/planner/abc123')).toBe(true)
    expect(scraper.canHandle('https://www.maxroll.gg/d4/planner/xyz')).toBe(true)
    expect(scraper.canHandle('https://d4builds.gg/builds/123')).toBe(false)
  })
})
