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
// - $: clickable tab buttons (Skills, Paragon)
// - $$eval: multiple selector patterns for skills AND paragon
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
    // Simulate clicking tab buttons — returns a clickable element for any tab
    $: vi.fn().mockResolvedValue({
      click: vi.fn().mockResolvedValue(null)
    }),
    // Simulate different DOM sections based on the selector pattern
    $$eval: vi.fn().mockImplementation((selector: string, callback: Function) => {
      // Skill nodes (triggered by skillTree selectors)
      if (selector.includes('skillTree') || selector.includes('skill-node')) {
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
      }

      // Paragon boards (triggered by paragonBoard selectors)
      if (selector.includes('paragonBoard')) {
        const mockBoards = [
          {
            querySelector: (sel: string) => {
              if (sel.includes('boardName')) return { textContent: 'Starting Board' }
              if (sel.includes('glyph'))
                return {
                  querySelector: (innerSel: string) => {
                    if (innerSel.includes('name')) return { textContent: 'Exploit' }
                    if (innerSel.includes('level')) return { textContent: '21' }
                    return null
                  }
                }
              return null
            },
            querySelectorAll: (_sel: string) => [
              {
                className: 'paragonNode__abc normal allocated',
                querySelector: (sel: string) => {
                  if (sel.includes('name')) return { textContent: 'Strength' }
                  return null
                }
              },
              {
                className: 'paragonNode__def magic allocated',
                querySelector: (sel: string) => {
                  if (sel.includes('name')) return { textContent: 'Tenacity' }
                  return null
                }
              },
              {
                className: 'paragonNode__ghi rare allocated',
                querySelector: (sel: string) => {
                  if (sel.includes('name')) return { textContent: 'Raw Power' }
                  return null
                }
              }
            ]
          },
          {
            querySelector: (sel: string) => {
              if (sel.includes('boardName')) return { textContent: 'Decimator' }
              if (sel.includes('glyph')) return null // No glyph on this board
              return null
            },
            querySelectorAll: (_sel: string) => [
              {
                className: 'paragonNode__jkl legendary allocated',
                querySelector: (sel: string) => {
                  if (sel.includes('name')) return { textContent: 'Decimator' }
                  return null
                }
              }
            ]
          }
        ]
        return callback(mockBoards)
      }

      // Gear slots (triggered by equipment selectors)
      if (selector.includes('equipment')) {
        const mockSlots = [
          {
            querySelector: (sel: string) => {
              if (sel.includes('SlotName') || sel.includes('slot')) return { textContent: 'Helm' }
              if (sel.includes('ItemName'))
                return { textContent: 'Harlequin Crest', className: 'unique' }
              if (sel.includes('Aspect')) return null // Unique items don't have aspects
              return null
            },
            querySelectorAll: (sel: string) => {
              if (sel.includes('affix'))
                return [{ textContent: 'Maximum Life' }, { textContent: 'Cooldown Reduction' }]
              if (sel.includes('temper')) return [{ textContent: 'Chance to Deal Double Damage' }]
              if (sel.includes('masterwork')) return [{ textContent: 'Maximum Life' }]
              return []
            },
            className: 'equipment_Slot__abc'
          },
          {
            querySelector: (sel: string) => {
              if (sel.includes('SlotName') || sel.includes('slot')) return { textContent: 'Chest' }
              if (sel.includes('ItemName')) return { textContent: null, className: 'legendary' }
              if (sel.includes('Aspect')) return { textContent: 'Aspect of Disobedience' }
              return null
            },
            querySelectorAll: (sel: string) => {
              if (sel.includes('affix'))
                return [{ textContent: 'Total Armor' }, { textContent: 'Maximum Life' }]
              if (sel.includes('temper')) return [{ textContent: 'Armor Contribution' }]
              if (sel.includes('masterwork')) return [{ textContent: 'Total Armor' }]
              return []
            },
            className: 'equipment_Slot__def'
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

  it('should extract paragon boards with glyphs and nodes', async () => {
    const data = await scraper.scrape('https://maxroll.gg/d4/planner/test')
    expect(data.paragonBoards).toHaveLength(2)

    // Verify first board with glyph
    const board1 = data.paragonBoards[0]
    expect(board1.boardName).toBe('Starting Board')
    expect(board1.boardIndex).toBe(0)
    expect(board1.glyph).toEqual({ glyphName: 'Exploit', level: 21 })
    expect(board1.allocatedNodes).toHaveLength(3)

    // Verify node types
    expect(board1.allocatedNodes[0]).toEqual({
      nodeName: 'Strength',
      nodeType: 'normal',
      allocated: true
    })
    expect(board1.allocatedNodes[1]).toEqual({
      nodeName: 'Tenacity',
      nodeType: 'magic',
      allocated: true
    })
    expect(board1.allocatedNodes[2]).toEqual({
      nodeName: 'Raw Power',
      nodeType: 'rare',
      allocated: true
    })

    // Verify second board without glyph
    const board2 = data.paragonBoards[1]
    expect(board2.boardName).toBe('Decimator')
    expect(board2.boardIndex).toBe(1)
    expect(board2.glyph).toBeNull()
    expect(board2.allocatedNodes).toHaveLength(1)
    expect(board2.allocatedNodes[0]).toEqual({
      nodeName: 'Decimator',
      nodeType: 'legendary',
      allocated: true
    })
  })

  it('should extract gear slots with aspects and affixes', async () => {
    const data = await scraper.scrape('https://maxroll.gg/d4/planner/test')
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
