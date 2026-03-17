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
// - $: clickable section tab buttons
// - $$eval: selector-routed responses for skills, paragon, gear
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
    // Simulate clicking section tab buttons
    $: vi.fn().mockResolvedValue({
      click: vi.fn().mockResolvedValue(null)
    }),
    // Selector-routed mock: returns different data based on the CSS selector
    $$eval: vi.fn().mockImplementation((selector: string, callback: Function) => {
      // Skills selectors
      if (selector.includes('builder__skill')) {
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
      }

      // Paragon selectors
      if (selector.includes('builder__paragon__board')) {
        const mockBoards = [
          {
            querySelector: (sel: string) => {
              if (sel.includes('board__name')) return { textContent: 'Warbringer' }
              if (sel.includes('board__glyph'))
                return {
                  querySelector: (innerSel: string) => {
                    if (innerSel.includes('name')) return { textContent: 'Wrath' }
                    if (innerSel.includes('level')) return { textContent: '15' }
                    return null
                  }
                }
              return null
            },
            querySelectorAll: () => [
              {
                className: 'builder__paragon__node normal',
                querySelector: (sel: string) => {
                  if (sel.includes('name')) return { textContent: 'Strength' }
                  return null
                }
              },
              {
                className: 'builder__paragon__node magic',
                querySelector: (sel: string) => {
                  if (sel.includes('name')) return { textContent: 'Brash' }
                  return null
                }
              },
              {
                className: 'builder__paragon__node rare',
                querySelector: (sel: string) => {
                  if (sel.includes('name')) return { textContent: 'Martial Vigor' }
                  return null
                }
              }
            ]
          },
          {
            querySelector: (sel: string) => {
              if (sel.includes('board__name')) return { textContent: 'Blood Rage' }
              if (sel.includes('board__glyph')) return null
              return null
            },
            querySelectorAll: () => [
              {
                className: 'builder__paragon__node legendary',
                querySelector: (sel: string) => {
                  if (sel.includes('name')) return { textContent: 'Blood Rage' }
                  return null
                }
              }
            ]
          }
        ]
        return callback(mockBoards)
      }

      // Gear selectors
      if (selector.includes('builder__gear__slot')) {
        const mockSlots = [
          {
            querySelector: (sel: string) => {
              if (sel.includes('slot__name')) return { textContent: 'Helm' }
              if (sel.includes('gear__item'))
                return { textContent: 'Harlequin Crest', className: 'unique' }
              if (sel.includes('gear__aspect')) return null
              return null
            },
            querySelectorAll: (sel: string) => {
              if (sel.includes('gear__affix'))
                return [{ textContent: 'Maximum Life' }, { textContent: 'Cooldown Reduction' }]
              if (sel.includes('gear__temper'))
                return [{ textContent: 'Chance to Deal Double Damage' }]
              if (sel.includes('gear__masterwork')) return [{ textContent: 'Maximum Life' }]
              return []
            },
            className: 'builder__gear__slot'
          },
          {
            querySelector: (sel: string) => {
              if (sel.includes('slot__name')) return { textContent: 'Chest' }
              if (sel.includes('gear__item')) return { textContent: null, className: 'legendary' }
              if (sel.includes('gear__aspect')) return { textContent: 'Aspect of Disobedience' }
              return null
            },
            querySelectorAll: (sel: string) => {
              if (sel.includes('gear__affix'))
                return [{ textContent: 'Total Armor' }, { textContent: 'Maximum Life' }]
              if (sel.includes('gear__temper')) return [{ textContent: 'Armor Contribution' }]
              if (sel.includes('gear__masterwork')) return [{ textContent: 'Total Armor' }]
              return []
            },
            className: 'builder__gear__slot'
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

    expect(data.skills[0]).toEqual({
      skillName: 'Hammer of the Ancients',
      points: 5,
      maxPoints: 5,
      tier: 'core',
      nodeType: 'active'
    })

    expect(data.skills[1]).toEqual({
      skillName: 'Imposing Presence',
      points: 3,
      maxPoints: 3,
      tier: 'core',
      nodeType: 'passive'
    })

    expect(data.skills[2]).toEqual({
      skillName: 'Unconstrained',
      points: 1,
      maxPoints: 1,
      tier: 'core',
      nodeType: 'keystone'
    })
  })

  it('should extract paragon boards', async () => {
    const data = await scraper.scrape('https://d4builds.gg/builds/test')
    expect(data.paragonBoards).toHaveLength(2)

    // First board with glyph
    const board1 = data.paragonBoards[0]
    expect(board1.boardName).toBe('Warbringer')
    expect(board1.boardIndex).toBe(0)
    expect(board1.glyph).toEqual({ glyphName: 'Wrath', level: 15 })
    expect(board1.allocatedNodes).toHaveLength(3)

    expect(board1.allocatedNodes[0]).toEqual({
      nodeName: 'Strength',
      nodeType: 'normal',
      allocated: true
    })
    expect(board1.allocatedNodes[1]).toEqual({
      nodeName: 'Brash',
      nodeType: 'magic',
      allocated: true
    })
    expect(board1.allocatedNodes[2]).toEqual({
      nodeName: 'Martial Vigor',
      nodeType: 'rare',
      allocated: true
    })

    // Second board without glyph
    const board2 = data.paragonBoards[1]
    expect(board2.boardName).toBe('Blood Rage')
    expect(board2.boardIndex).toBe(1)
    expect(board2.glyph).toBeNull()
    expect(board2.allocatedNodes).toHaveLength(1)
    expect(board2.allocatedNodes[0]).toEqual({
      nodeName: 'Blood Rage',
      nodeType: 'legendary',
      allocated: true
    })
  })

  it('should extract gear slots', async () => {
    const data = await scraper.scrape('https://d4builds.gg/builds/test')
    expect(data.gearSlots).toHaveLength(2)

    // Verify Unique item (Helm)
    const helm = data.gearSlots[0]
    expect(helm.slot).toBe('Helm')
    expect(helm.itemName).toBe('Harlequin Crest')
    expect(helm.itemType).toBe('Unique')
    expect(helm.requiredAspect).toBeNull()
    expect(helm.priorityAffixes).toEqual([
      { name: 'Maximum Life', priority: 1 },
      { name: 'Cooldown Reduction', priority: 2 }
    ])
    expect(helm.temperingTargets).toEqual(['Chance to Deal Double Damage'])
    expect(helm.masterworkPriority).toEqual(['Maximum Life'])

    // Verify Legendary item (Chest with aspect)
    const chest = data.gearSlots[1]
    expect(chest.slot).toBe('Chest')
    expect(chest.itemName).toBeNull()
    expect(chest.itemType).toBe('Legendary')
    expect(chest.requiredAspect).toBe('Aspect of Disobedience')
    expect(chest.priorityAffixes).toEqual([
      { name: 'Total Armor', priority: 1 },
      { name: 'Maximum Life', priority: 2 }
    ])
    expect(chest.temperingTargets).toEqual(['Armor Contribution'])
    expect(chest.masterworkPriority).toEqual(['Total Armor'])
  })
})
