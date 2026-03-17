import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MaxrollScraper } from '../../../src/main/scrapers/MaxrollScraper'

// ============================================================
// Mock Playwright — simulates the Maxroll planner DOM
// ============================================================
// vi.hoisted() ensures these values exist before vi.mock()
// runs (since vi.mock is hoisted to the top of the file).
//
// The mock page simulates:
// - $eval: metadata from the header (build name, class)
// - $: clickable Skills tab button
// - $$eval: allocated skill nodes from the tree
// ============================================================

const { mockPage } = vi.hoisted(() => {
  const mockPage = {
    goto: vi.fn().mockResolvedValue(null),
    waitForSelector: vi.fn().mockResolvedValue(null),
    $eval: vi.fn().mockImplementation((selector: string, callback: Function) => {
      if (selector.includes('buildTitle')) return callback({ textContent: 'Test Build' })
      if (selector.includes('SelectValue')) return callback({ textContent: 'Spiritborn' })
      return null
    }),
    // Simulate the Skills tab button
    $: vi.fn().mockResolvedValue({
      click: vi.fn().mockResolvedValue(null)
    }),
    // Simulate allocated skill nodes in the tree
    $$eval: vi.fn().mockImplementation((_selector: string, callback: Function) => {
      const mockNodes = [
        {
          className: 'skillTree_SkillNode__abc active',
          textContent: 'Bash 5/5',
          querySelector: (sel: string) => {
            if (sel.includes('name') || sel.includes('label') || sel === 'span')
              return { textContent: 'Bash' }
            if (sel.includes('points') || sel.includes('rank')) return { textContent: '5/5' }
            return null
          },
          closest: () => ({ getAttribute: () => 'basic' }),
          getAttribute: () => null
        },
        {
          className: 'skillTree_SkillNode__def active passive',
          textContent: 'Endless Fury 3/3',
          querySelector: (sel: string) => {
            if (sel.includes('name') || sel.includes('label') || sel === 'span')
              return { textContent: 'Endless Fury' }
            if (sel.includes('points') || sel.includes('rank')) return { textContent: '3/3' }
            return null
          },
          closest: () => ({ getAttribute: () => 'core' }),
          getAttribute: () => null
        },
        {
          className: 'skillTree_SkillNode__ghi active keystone',
          textContent: 'Walking Arsenal 1/1',
          querySelector: (sel: string) => {
            if (sel.includes('name') || sel.includes('label') || sel === 'span')
              return { textContent: 'Walking Arsenal' }
            if (sel.includes('points') || sel.includes('rank')) return { textContent: '1/1' }
            return null
          },
          closest: () => null,
          getAttribute: () => null
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

describe('MaxrollScraper', () => {
  let scraper: MaxrollScraper

  beforeEach(() => {
    scraper = new MaxrollScraper()
    vi.clearAllMocks()
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

  it('should attempt to click the Skills tab', async () => {
    await scraper.scrape('https://maxroll.gg/d4/planner/test')
    // The scraper should have looked for the Skills tab button
    expect(mockPage.$).toHaveBeenCalled()
  })

  it('should extract allocated skills from the tree', async () => {
    const data = await scraper.scrape('https://maxroll.gg/d4/planner/test')
    expect(data.skills).toHaveLength(3)

    // Verify the first skill (basic active)
    expect(data.skills[0]).toEqual({
      skillName: 'Bash',
      points: 5,
      maxPoints: 5,
      tier: 'basic',
      nodeType: 'active'
    })

    // Verify a passive skill
    expect(data.skills[1]).toEqual({
      skillName: 'Endless Fury',
      points: 3,
      maxPoints: 3,
      tier: 'core',
      nodeType: 'passive'
    })

    // Verify a keystone skill
    expect(data.skills[2]).toEqual({
      skillName: 'Walking Arsenal',
      points: 1,
      maxPoints: 1,
      tier: 'core', // Fallback when closest() returns null
      nodeType: 'keystone'
    })
  })
})
