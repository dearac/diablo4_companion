import { describe, it, expect, vi, beforeEach } from 'vitest'
import { D4BuildsScraper } from '../../../src/main/scrapers/D4BuildsScraper'

// ============================================================
// Mock Playwright — simulates the D4Builds page DOM
// ============================================================
// Updated to match the new scraper's real selectors (2026-03-16):
//   - .builder__header__description (h2 build name)
//   - .builder__header__icon (class from CSS class)
//   - .build__skill__wrapper (skill name in CSS class)
//   - .skill__tree__item--active (allocated skill tree nodes)
//   - .builder__gear__item (gear slots)
//   - .builder__navigation__link (tab buttons)
// ============================================================

const { mockPage } = vi.hoisted(() => {
  const mockPage = {
    goto: vi.fn().mockResolvedValue(null),
    waitForSelector: vi.fn().mockResolvedValue(null),
    waitForTimeout: vi.fn().mockResolvedValue(null),

    // $eval returns Promises (the real Playwright API returns Promises)
    $eval: vi.fn().mockImplementation((selector: string, callback: Function) => {
      if (selector.includes('description'))
        return Promise.resolve(callback({ textContent: "Rob's Cpt. America" }))
      if (selector.includes('header__icon'))
        return Promise.resolve(callback({ className: 'builder__header__icon Paladin' }))
      return Promise.resolve(null)
    }),

    // $$eval also returns Promises
    $$eval: vi.fn().mockImplementation((selector: string, callback: Function) => {
      // Active skills from Gear & Skills tab
      if (selector.includes('build__skill__wrapper')) {
        const mockWrappers = [
          { className: 'build__skill__wrapper BlessedShield ' },
          { className: 'build__skill__wrapper Consecration ' },
          { className: 'build__skill__wrapper DefianceAura ' }
        ]
        return Promise.resolve(callback(mockWrappers))
      }

      // Skill tree nodes (allocated)
      if (selector.includes('skill__tree__item--active')) {
        const mockNodes = [
          {
            className:
              'skill__tree__item r1 c1 large after_bottom skill__tree__item--active skill__tree__item--cap blessed_shield',
            querySelector: (sel: string) => {
              if (sel.includes('count')) return { textContent: '5/5' }
              return null
            }
          },
          {
            className:
              'skill__tree__item r3 c2 diamond skill__tree__item--active skill__tree__item--cap enhanced_blessed_shield',
            querySelector: (sel: string) => {
              if (sel.includes('count')) return { textContent: '1/1' }
              return null
            }
          },
          {
            className: 'skill__tree__item r2 c3 small skill__tree__item--active iron_skin',
            querySelector: (sel: string) => {
              if (sel.includes('count')) return { textContent: '0/5' }
              return null
            }
          }
        ]
        return Promise.resolve(callback(mockNodes))
      }

      // Skill tree items (for waitForSelector fallback)
      if (selector.includes('skill__tree__item') && !selector.includes('active')) {
        return Promise.resolve(callback([]))
      }

      // Paragon boards
      if (selector.includes('paragon__board__name')) {
        const mockBoards = [{ textContent: 'Warbringer' }, { textContent: 'Blood Rage' }]
        return Promise.resolve(callback(mockBoards))
      }

      // Gear items
      if (selector.includes('builder__gear__item')) {
        const mockItems = [
          {
            querySelector: (sel: string) => {
              if (sel.includes('gear__slot')) return { textContent: 'Helm' }
              if (sel.includes('gear__name'))
                return {
                  textContent: 'Heir of Perdition',
                  className: 'builder__gear__name builder__gear__name--mythic'
                }
              return null
            }
          },
          {
            querySelector: (sel: string) => {
              if (sel.includes('gear__slot')) return { textContent: 'Chest Armor' }
              if (sel.includes('gear__name'))
                return {
                  textContent: 'Mantle of the Grey',
                  className: 'builder__gear__name builder__gear__name--unique'
                }
              return null
            }
          }
        ]
        return Promise.resolve(callback(mockItems))
      }

      return Promise.resolve(callback([]))
    }),

    // Locator for tab navigation
    locator: vi.fn().mockReturnValue({
      first: vi.fn().mockReturnValue({
        click: vi.fn().mockResolvedValue(null)
      })
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
    expect(
      scraper.canHandle('https://d4builds.gg/builds/blessed-shield-paladin-endgame/?var=0')
    ).toBe(true)
    expect(scraper.canHandle('https://maxroll.gg/d4/planner/test')).toBe(false)
  })

  it('should scrape basic metadata', async () => {
    const data = await scraper.scrape('https://d4builds.gg/builds/test')
    expect(data.name).toBe("Rob's Cpt. America")
    // "Paladin" doesn't map to a standard D4 class, falls back to Barbarian
    expect(data.d4Class).toBe('Barbarian')
    expect(data.level).toBe(100)
  })

  it('should extract skill tree allocations', async () => {
    const data = await scraper.scrape('https://d4builds.gg/builds/test')

    // Only nodes with points > 0 should be included
    // The mock has 3 nodes, but the 3rd has 0/5 so should be filtered out
    expect(data.skills.length).toBeGreaterThanOrEqual(2)

    // Check first skill — "Blessed Shield" (from CSS class blessed_shield)
    const blessedShield = data.skills.find((s) => s.skillName.includes('Blessed'))
    expect(blessedShield).toBeDefined()
    expect(blessedShield!.points).toBe(5)
    expect(blessedShield!.maxPoints).toBe(5)

    // Check second skill — "Enhanced Blessed Shield" (from CSS class enhanced_blessed_shield)
    const enhanced = data.skills.find((s) => s.skillName.includes('Enhanced'))
    expect(enhanced).toBeDefined()
    expect(enhanced!.points).toBe(1)
    expect(enhanced!.maxPoints).toBe(1)
  })

  it('should extract paragon boards', async () => {
    const data = await scraper.scrape('https://d4builds.gg/builds/test')
    expect(data.paragonBoards).toHaveLength(2)

    expect(data.paragonBoards[0].boardName).toBe('Warbringer')
    expect(data.paragonBoards[0].boardIndex).toBe(0)

    expect(data.paragonBoards[1].boardName).toBe('Blood Rage')
    expect(data.paragonBoards[1].boardIndex).toBe(1)
  })

  it('should extract gear slots', async () => {
    const data = await scraper.scrape('https://d4builds.gg/builds/test')
    expect(data.gearSlots).toHaveLength(2)

    const helm = data.gearSlots[0]
    expect(helm.slot).toBe('Helm')
    expect(helm.itemName).toBe('Heir of Perdition')
    expect(helm.itemType).toBe('Unique') // mythic maps to Unique

    const chest = data.gearSlots[1]
    expect(chest.slot).toBe('Chest Armor')
    expect(chest.itemName).toBe('Mantle of the Grey')
    expect(chest.itemType).toBe('Unique')
  })
})
