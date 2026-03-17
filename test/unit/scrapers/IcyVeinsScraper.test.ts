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
// - $: section heading elements
// - $$eval: selector-routed responses for skills, paragon, gear
// ============================================================

const { mockPage } = vi.hoisted(() => {
  const mockPage = {
    goto: vi.fn().mockResolvedValue(null),
    waitForSelector: vi.fn().mockResolvedValue(null),
    $eval: vi.fn().mockImplementation((_selector: string, callback: Function) => {
      return callback({ textContent: 'Heartseeker Rogue Build Guide' })
    }),
    $: vi.fn().mockResolvedValue(null),
    // Selector-routed mock: returns different data based on CSS selector
    $$eval: vi.fn().mockImplementation((selector: string, callback: Function) => {
      // Skills selectors
      if (
        selector.includes('skill-list') ||
        selector.includes('skills-list') ||
        selector.includes('skill-entry') ||
        selector.includes('section.skills')
      ) {
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
      }

      // Paragon selectors
      if (
        selector.includes('paragon-board') ||
        selector.includes('paragon_board') ||
        selector.includes('section.paragon')
      ) {
        const mockBoards = [
          {
            querySelector: (sel: string) => {
              if (sel.includes('board-name') || sel === 'h3' || sel === 'h4')
                return { textContent: 'No Witnesses' }
              if (sel.includes('glyph'))
                return {
                  querySelector: (innerSel: string) => {
                    if (innerSel.includes('name')) return { textContent: 'Ranger' }
                    if (innerSel.includes('level')) return { textContent: '21' }
                    return null
                  }
                }
              return null
            },
            querySelectorAll: () => [
              {
                className: 'paragon-node normal',
                querySelector: (sel: string) => {
                  if (sel.includes('name')) return { textContent: 'Dexterity' }
                  return null
                }
              },
              {
                className: 'paragon-node rare',
                querySelector: (sel: string) => {
                  if (sel.includes('name')) return { textContent: 'Tricks of the Trade' }
                  return null
                }
              }
            ]
          },
          {
            querySelector: (sel: string) => {
              if (sel.includes('board-name') || sel === 'h3' || sel === 'h4')
                return { textContent: 'Eldritch Bounty' }
              if (sel.includes('glyph')) return null
              return null
            },
            querySelectorAll: () => [
              {
                className: 'paragon-node legendary',
                querySelector: (sel: string) => {
                  if (sel.includes('name')) return { textContent: 'Eldritch Bounty' }
                  return null
                }
              }
            ]
          }
        ]
        return callback(mockBoards)
      }

      // Gear selectors
      if (
        selector.includes('gear-slot') ||
        selector.includes('equipment') ||
        selector.includes('section.gear')
      ) {
        const mockSlots = [
          {
            querySelector: (sel: string) => {
              if (sel.includes('slot-name') || sel === 'h4' || sel === 'strong')
                return { textContent: 'Helm' }
              if (sel.includes('item-name'))
                return { textContent: "Andariel's Visage", className: 'unique' }
              if (sel.includes('aspect')) return null
              return null
            },
            querySelectorAll: (sel: string) => {
              if (sel.includes('affix'))
                return [{ textContent: 'Maximum Life' }, { textContent: 'Attack Speed' }]
              if (sel.includes('temper')) return [{ textContent: 'Chance for Double Damage' }]
              if (sel.includes('masterwork')) return [{ textContent: 'Maximum Life' }]
              return []
            },
            className: 'gear-slot'
          },
          {
            querySelector: (sel: string) => {
              if (sel.includes('slot-name') || sel === 'h4' || sel === 'strong')
                return { textContent: 'Chest' }
              if (sel.includes('item-name')) return { textContent: null, className: 'legendary' }
              if (sel.includes('aspect')) return { textContent: 'Aspect of Might' }
              return null
            },
            querySelectorAll: (sel: string) => {
              if (sel.includes('affix'))
                return [{ textContent: 'Total Armor' }, { textContent: 'Maximum Life' }]
              if (sel.includes('temper')) return [{ textContent: 'Armor Contribution' }]
              if (sel.includes('masterwork')) return [{ textContent: 'Total Armor' }]
              return []
            },
            className: 'gear-slot'
          }
        ]
        return callback(mockSlots)
      }

      return callback([])
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
    expect(scraper.canHandle('https://www.icy-veins.com/wow/warrior-guide')).toBe(false)
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

    expect(data.skills[0]).toEqual({
      skillName: 'Heartseeker',
      points: 5,
      maxPoints: 5,
      tier: 'core',
      nodeType: 'active'
    })

    expect(data.skills[1]).toEqual({
      skillName: 'Weapon Mastery',
      points: 3,
      maxPoints: 3,
      tier: 'core',
      nodeType: 'active'
    })

    expect(data.skills[2]).toEqual({
      skillName: 'Precision',
      points: 1,
      maxPoints: 1,
      tier: 'core',
      nodeType: 'active'
    })
  })

  it('should extract paragon boards', async () => {
    const data = await scraper.scrape('https://www.icy-veins.com/d4/rogue-heartseeker-build')
    expect(data.paragonBoards).toHaveLength(2)

    // First board with glyph
    const board1 = data.paragonBoards[0]
    expect(board1.boardName).toBe('No Witnesses')
    expect(board1.boardIndex).toBe(0)
    expect(board1.glyph).toEqual({ glyphName: 'Ranger', level: 21 })
    expect(board1.allocatedNodes).toHaveLength(2)

    expect(board1.allocatedNodes[0]).toEqual({
      nodeName: 'Dexterity',
      nodeType: 'normal',
      allocated: true
    })
    expect(board1.allocatedNodes[1]).toEqual({
      nodeName: 'Tricks of the Trade',
      nodeType: 'rare',
      allocated: true
    })

    // Second board without glyph
    const board2 = data.paragonBoards[1]
    expect(board2.boardName).toBe('Eldritch Bounty')
    expect(board2.boardIndex).toBe(1)
    expect(board2.glyph).toBeNull()
    expect(board2.allocatedNodes).toHaveLength(1)
    expect(board2.allocatedNodes[0]).toEqual({
      nodeName: 'Eldritch Bounty',
      nodeType: 'legendary',
      allocated: true
    })
  })
})
