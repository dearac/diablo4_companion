import { describe, it, expect, vi, beforeEach } from 'vitest'
import { D4BuildsScraper } from '../../../src/main/scrapers/D4BuildsScraper'

// ============================================================
// Mock Playwright — simulates the D4Builds planner DOM
// ============================================================
// vi.hoisted() ensures these values exist before vi.mock()
// runs (since vi.mock is hoisted to the top of the file).
//
// The mock page simulates:
// - $eval: metadata from the header (build name, class title)
// - $: clickable skill section tab
// - $$eval: allocated skill nodes from the skill tree
// ============================================================

const { mockPage } = vi.hoisted(() => {
  const mockPage = {
    goto: vi.fn().mockResolvedValue(null),
    waitForSelector: vi.fn().mockResolvedValue(null),
    $eval: vi.fn().mockImplementation((selector: string, callback: Function) => {
      if (selector.includes('description')) return callback({ textContent: "Rob's Cpt. America" })
      if (selector.includes('header__title'))
        return callback({ textContent: 'Blessed Shield Paladin Build' })
      return null
    }),
    // Simulate the Skills section tab button
    $: vi.fn().mockResolvedValue({
      click: vi.fn().mockResolvedValue(null)
    }),
    // Simulate allocated skill nodes in d4builds' skill tree
    // The $$eval callback receives an array of mock DOM nodes
    $$eval: vi.fn().mockImplementation((_selector: string, callback: Function) => {
      const mockNodes = [
        {
          className: 'builder__skill builder__skill--active',
          querySelector: (sel: string) => {
            if (sel.includes('skill__name')) return { textContent: 'Hammer of the Ancients' }
            if (sel.includes('skill__points')) return { textContent: '5/5' }
            if (sel.includes('skill__type')) return { textContent: 'active' }
            return null
          }
        },
        {
          className: 'builder__skill builder__skill--active',
          querySelector: (sel: string) => {
            if (sel.includes('skill__name')) return { textContent: 'Imposing Presence' }
            if (sel.includes('skill__points')) return { textContent: '3/3' }
            if (sel.includes('skill__type')) return { textContent: 'passive' }
            return null
          }
        },
        {
          className: 'builder__skill builder__skill--active',
          querySelector: (sel: string) => {
            if (sel.includes('skill__name')) return { textContent: 'Unconstrained' }
            if (sel.includes('skill__points')) return { textContent: '1/1' }
            if (sel.includes('skill__type')) return { textContent: 'keystone' }
            return null
          }
        }
      ]
      return callback(mockNodes)
    }),
    close: vi.fn().mockResolvedValue(null)
  }
  return { mockPage }
})

vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue(mockPage)
      }),
      close: vi.fn().mockResolvedValue(null)
    })
  }
}))

describe('D4BuildsScraper', () => {
  let scraper: D4BuildsScraper

  beforeEach(() => {
    scraper = new D4BuildsScraper()
    vi.clearAllMocks()
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
    // Fallback for Paladin (not a recognized D4 class)
    expect(data.d4Class).toBe('Barbarian')
    expect(data.level).toBe(100)
  })

  it('should extract allocated skills', async () => {
    const data = await scraper.scrape('https://d4builds.gg/builds/test')
    expect(data.skills).toHaveLength(3)

    // Verify the first skill (active)
    expect(data.skills[0]).toEqual({
      skillName: 'Hammer of the Ancients',
      points: 5,
      maxPoints: 5,
      tier: 'core',
      nodeType: 'active'
    })

    // Verify a passive skill
    expect(data.skills[1]).toEqual({
      skillName: 'Imposing Presence',
      points: 3,
      maxPoints: 3,
      tier: 'core',
      nodeType: 'passive'
    })

    // Verify a keystone skill
    expect(data.skills[2]).toEqual({
      skillName: 'Unconstrained',
      points: 1,
      maxPoints: 1,
      tier: 'core',
      nodeType: 'keystone'
    })
  })
})
