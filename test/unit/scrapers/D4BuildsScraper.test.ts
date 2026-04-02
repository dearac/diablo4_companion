import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockBrowserWindow } = vi.hoisted(() => {
  const mockBrowserWindow = {
    loadURL: vi.fn().mockResolvedValue(null),
    close: vi.fn(),
    webContents: {
      executeJavaScript: vi.fn().mockImplementation((script: string) => {
        if (script.includes('!!document.querySelector')) return Promise.resolve(true)

        if (script.includes('.builder__header__description'))
          return Promise.resolve("Rob's Cpt. America")
        if (script.includes('.builder__header__icon'))
          return Promise.resolve('builder__header__icon Paladin')

        if (script.includes('.builder__navigation__link')) return Promise.resolve()

        if (script.includes('.build__skill__wrapper')) {
          return Promise.resolve([
            {
              skillName: 'Blessed Shield',
              points: 1,
              maxPoints: 1,
              tier: 'active',
              nodeType: 'active'
            },
            {
              skillName: 'Consecration',
              points: 1,
              maxPoints: 1,
              tier: 'active',
              nodeType: 'active'
            }
          ])
        }

        if (script.includes('.skill__tree__item--active')) {
          return Promise.resolve([
            {
              skillName: 'Blessed Shield',
              points: 5,
              maxPoints: 5,
              tier: 'core',
              nodeType: 'active'
            },
            {
              skillName: 'Enhanced Blessed Shield',
              points: 1,
              maxPoints: 1,
              tier: 'core',
              nodeType: 'passive'
            }
          ])
        }

        if (script.includes('.paragon__board')) {
          if (script.includes('.paragon__tile__tooltip')) {
            // Phase B (hover)
            return Promise.resolve([])
          }
          // Phase A
          return Promise.resolve([
            {
              boardName: 'Warbringer',
              boardIndex: 0,
              glyph: { glyphName: 'Spirit', level: 15 },
              allocatedNodes: [
                { nodeName: 'Str', nodeType: 'normal', allocated: true, row: 5, col: 5 }
              ],
              boardRotation: 90,
              boardBgUrl: '',
              boardX: 0,
              boardY: 0,
              tileCount: 3
            },
            {
              boardName: 'Blood Rage',
              boardIndex: 1,
              glyph: null,
              allocatedNodes: [],
              boardRotation: 0,
              boardBgUrl: '',
              boardX: 0,
              boardY: 0,
              tileCount: 0
            }
          ])
        }

        if (script.includes('.builder__gear__item')) {
          // Phase A gear
          return Promise.resolve([
            { slot: 'Helm', itemName: 'Heir of Perdition', itemType: 'Unique', socketedGems: [] },
            {
              slot: 'Chest Armor',
              itemName: 'Mantle of the Grey',
              itemType: 'Unique',
              socketedGems: []
            }
          ])
        }

        if (script.includes('.builder__stats__group')) {
          return Promise.resolve([
            {
              slot: 'Helm',
              affixes: [
                { name: '45% Critical Strike Chance', isGreater: false },
                { name: '+15% Cooldown Reduction', isGreater: false }
              ],
              implicitAffixes: [],
              temperedAffixes: [],
              greaterAffixes: [{ name: '+120 Strength', isGreater: true }],
              rampageEffect: null,
              feastEffect: null
            },
            {
              slot: 'Chest Armor',
              affixes: [],
              implicitAffixes: [],
              temperedAffixes: [],
              greaterAffixes: [],
              rampageEffect: null,
              feastEffect: null
            }
          ])
        }

        if (script.includes('.codex__tooltip')) {
          // Phase C gear aspect
          return Promise.resolve([])
        }

        if (script.includes('.builder__gems')) {
          // Runes
          if (script.includes('.gem__tooltip')) return Promise.resolve(null) // hover
          return Promise.resolve([]) // Phase A array
        }

        return Promise.resolve(null)
      })
    }
  }
  return { mockBrowserWindow }
})

const electronMock = vi.hoisted(() => ({
  BrowserWindow: class {
    constructor() {
      return mockBrowserWindow
    }
  },
  app: { getPath: vi.fn().mockReturnValue('/tmp'), getAppPath: vi.fn().mockReturnValue('/tmp') },
  ipcMain: { handle: vi.fn(), on: vi.fn() }
}))
vi.mock('electron', () => electronMock)

import { D4BuildsScraper } from '../../../src/main/scrapers/D4BuildsScraper'

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
    expect(data.d4Class).toBe('Paladin')
    expect(data.level).toBe(100)
  })

  it('should extract skill tree allocations', async () => {
    const data = await scraper.scrape('https://d4builds.gg/builds/test')
    expect(data.skills.length).toBeGreaterThanOrEqual(2)

    const blessedShield = data.skills.find((s) => s.skillName.includes('Blessed'))
    expect(blessedShield).toBeDefined()
    expect(blessedShield!.points).toBe(5)
    expect(blessedShield!.maxPoints).toBe(5)

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
    expect(data.paragonBoards[0].glyph).toEqual({ glyphName: 'Spirit', level: 15 })
    expect(data.paragonBoards[0].allocatedNodes.length).toBe(1)
    expect(data.paragonBoards[0].allocatedNodes[0].allocated).toBe(true)

    expect(data.paragonBoards[1].boardName).toBe('Blood Rage')
    expect(data.paragonBoards[1].boardIndex).toBe(1)
    expect(data.paragonBoards[1].glyph).toBeNull()
  })

  it('should extract gear slots', async () => {
    const data = await scraper.scrape('https://d4builds.gg/builds/test')
    expect(data.gearSlots).toHaveLength(2)

    const helm = data.gearSlots[0]
    expect(helm.slot).toBe('Helm')
    expect(helm.itemName).toBe('Heir of Perdition')
    expect(helm.itemType).toBe('Unique')
    expect(helm.affixes).toHaveLength(2)
    expect(helm.affixes[0].name).toBe('45% Critical Strike Chance')
    expect(helm.affixes[1].name).toBe('+15% Cooldown Reduction')

    const chest = data.gearSlots[1]
    expect(chest.slot).toBe('Chest Armor')
    expect(chest.itemName).toBe('Mantle of the Grey')
    expect(chest.itemType).toBe('Unique')
    expect(chest.affixes).toHaveLength(0)
  })

  it('should NOT duplicate greater affixes into regular affixes', async () => {
    const data = await scraper.scrape('https://d4builds.gg/builds/test')
    const helm = data.gearSlots[0]

    expect(helm.greaterAffixes).toHaveLength(1)
    expect(helm.greaterAffixes[0].name).toBe('+120 Strength')
    expect(helm.greaterAffixes[0].isGreater).toBe(true)

    const regularAffixNames = helm.affixes.map((a) => a.name)
    expect(regularAffixNames).not.toContain('+120 Strength')
  })
})
