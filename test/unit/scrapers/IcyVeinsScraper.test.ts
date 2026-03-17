import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IcyVeinsScraper } from '../../../src/main/scrapers/IcyVeinsScraper'

// ============================================================
// Mock Playwright — simulates the Icy Veins guide DOM
// ============================================================
// vi.hoisted() ensures these values exist before vi.mock()
// runs (since vi.mock is hoisted to the top of the file).
//
// The mock page simulates:
// - $eval: metadata from the page heading (build title/class)
// - $: skill section heading element
// - $$eval: skill list items from the editorial guide
// ============================================================

const { mockPage } = vi.hoisted(() => {
  const mockPage = {
    goto: vi.fn().mockResolvedValue(null),
    waitForSelector: vi.fn().mockResolvedValue(null),
    $eval: vi.fn().mockImplementation((_selector: string, callback: Function) => {
      // Simulate Icy Veins' <h1> content
      return callback({ textContent: 'Heartseeker Rogue Build Guide' })
    }),
    // Simulate the skills section heading element
    $: vi.fn().mockResolvedValue(null),
    // Simulate skill list items from the editorial guide
    // Icy Veins lists skills in ordered/unordered lists with
    // skill name and point allocation as text content
    $$eval: vi.fn().mockImplementation((_selector: string, callback: Function) => {
      const mockItems = [
        {
          textContent: 'Heartseeker (5/5)',
          querySelector: (sel: string) => {
            if (sel.includes('skill-name') || sel === 'a' || sel === 'strong')
              return { textContent: 'Heartseeker' }
            if (sel.includes('points') || sel.includes('badge')) return { textContent: '5/5' }
            return null
          }
        },
        {
          textContent: 'Weapon Mastery (3/3)',
          querySelector: (sel: string) => {
            if (sel.includes('skill-name') || sel === 'a' || sel === 'strong')
              return { textContent: 'Weapon Mastery' }
            if (sel.includes('points') || sel.includes('badge')) return { textContent: '3/3' }
            return null
          }
        },
        {
          textContent: 'Precision (1/1)',
          querySelector: (sel: string) => {
            if (sel.includes('skill-name') || sel === 'a' || sel === 'strong')
              return { textContent: 'Precision' }
            if (sel.includes('points') || sel.includes('badge')) return { textContent: '1/1' }
            return null
          }
        }
      ]
      return callback(mockItems)
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

describe('IcyVeinsScraper', () => {
  let scraper: IcyVeinsScraper

  beforeEach(() => {
    scraper = new IcyVeinsScraper()
    vi.clearAllMocks()
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
  })

  it('should extract allocated skills from the skill list', async () => {
    const data = await scraper.scrape('https://www.icy-veins.com/d4/rogue-heartseeker-build')
    expect(data.skills).toHaveLength(3)

    // Verify the first skill (active)
    expect(data.skills[0]).toEqual({
      skillName: 'Heartseeker',
      points: 5,
      maxPoints: 5,
      tier: 'core',
      nodeType: 'active'
    })

    // Verify a passive skill
    expect(data.skills[1]).toEqual({
      skillName: 'Weapon Mastery',
      points: 3,
      maxPoints: 3,
      tier: 'core',
      nodeType: 'active'
    })

    // Verify a keystone skill
    expect(data.skills[2]).toEqual({
      skillName: 'Precision',
      points: 1,
      maxPoints: 1,
      tier: 'core',
      nodeType: 'active'
    })
  })
})
