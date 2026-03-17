import { chromium, Page } from 'playwright'
import { BuildScraper, RawBuildData } from './BuildScraper'
import {
  BuildSourceSite,
  D4Class,
  ISkillAllocation,
  IParagonBoard,
  IGearSlot
} from '../../shared/types'

// ============================================================
// D4BuildsScraper — Scraper for d4builds.gg build planner
// ============================================================
// D4Builds uses a tabbed interface with buttons having class
// `.builder__navigation__link`. The default tab shows Gear & Skills.
// The Skill Tree tab must be clicked to see point allocations.
//
// Key selectors (verified against live site 2026-03-16):
//   Header:   .builder__header__name (h1), .builder__header__description (h2)
//   Class:    .builder__header__icon (class name in CSS class, e.g. "Paladin")
//   Skills:   .build__skill__wrapper (skill name in CSS class)
//   Tree:     .skill__tree__item--active with .skill__tree__item__count
//   Gear:     .builder__gear__item with .builder__gear__name, .builder__gear__slot
//   Nav tabs: button.builder__navigation__link
// ============================================================

export class D4BuildsScraper extends BuildScraper {
  readonly siteName = 'd4builds.gg'
  readonly sourceKey: BuildSourceSite = 'd4builds'

  canHandle(url: string): boolean {
    const normalized = url.toLowerCase().trim()
    return normalized.includes('d4builds.gg/builds/')
  }

  async scrape(url: string): Promise<RawBuildData> {
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    })
    const page = await context.newPage()

    try {
      // 1. Navigate — use 'domcontentloaded' instead of 'networkidle'
      //    because d4builds.gg has persistent WebSocket connections
      //    that prevent networkidle from ever firing
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })

      // 2. Wait for the build header to appear (proves page loaded)
      await page.waitForSelector('.builder__header__description', { timeout: 30000 })

      // 3. Extract Metadata
      const buildName = await page
        .$eval('.builder__header__description', (el) => el.textContent?.trim() || 'Unknown Build')
        .catch(() => 'Unknown Build')

      // Class name is embedded in the header icon's CSS class
      const d4ClassRaw = await page
        .$eval('.builder__header__icon', (el) => {
          // Classes like "builder__header__icon Paladin"
          const classes = el.className.split(/\s+/)
          return classes.find((c) => c !== 'builder__header__icon') || 'Unknown'
        })
        .catch(() => 'Unknown')

      const d4Class = this.normalizeClass(d4ClassRaw)

      // 4. Extract active skills from the default Gear & Skills tab
      const skills = await this.scrapeSkills(page)

      // 5. Click "Skill Tree" tab and extract allocations
      const skillAllocations = await this.scrapeSkillTree(page)

      // 6. Click "Paragon" tab and extract boards
      const paragonBoards = await this.scrapeParagon(page)

      // 7. Extract gear (visible on default Gear & Skills tab, go back to it)
      await this.clickTab(page, 'Gear')
      const gearSlots = await this.scrapeGear(page)

      // Merge skill names from active skills with allocations from skill tree
      const mergedSkills = skillAllocations.length > 0 ? skillAllocations : skills

      return {
        name: buildName,
        d4Class: d4Class,
        level: 100,
        skills: mergedSkills,
        paragonBoards,
        gearSlots
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`Scraping failed for ${url}:`, message)
      throw new Error(`Failed to scrape D4Builds: ${message}`)
    } finally {
      await browser.close()
    }
  }

  /**
   * Clicks a builder navigation tab by matching text.
   */
  private async clickTab(page: Page, tabText: string): Promise<void> {
    const tab = page.locator(`.builder__navigation__link`, { hasText: tabText }).first()
    try {
      await tab.click({ timeout: 5000 })
      // Wait a beat for content to load after tab switch
      await page.waitForTimeout(1000)
    } catch {
      // Tab might not exist for some builds
      console.warn(`Tab "${tabText}" not found, skipping`)
    }
  }

  /**
   * Extracts active skill names from the Gear & Skills tab.
   * Each skill is a button.builder__skill containing a
   * div.build__skill__wrapper whose CSS class contains the skill name.
   */
  private async scrapeSkills(page: Page): Promise<ISkillAllocation[]> {
    const skills = await page
      .$$eval('.build__skill__wrapper', (wrappers) => {
        return wrappers.map((wrapper) => {
          // Skill name is in the CSS class — e.g., "build__skill__wrapper BlessedShield"
          const classes = wrapper.className.split(/\s+/)
          const skillClass =
            classes.find((c) => c !== 'build__skill__wrapper' && c.trim() !== '') || 'Unknown'

          // Convert PascalCase to readable — "BlessedShield" → "Blessed Shield"
          const skillName = skillClass.replace(/([a-z])([A-Z])/g, '$1 $2')

          return {
            skillName,
            points: 1,
            maxPoints: 1,
            tier: 'active',
            nodeType: 'active' as const
          }
        })
      })
      .catch(() => [] as ISkillAllocation[])

    return skills
  }

  /**
   * Clicks the "Skill Tree" tab and extracts allocated skill nodes.
   * Each allocated node has class `.skill__tree__item--active` and
   * contains `.skill__tree__item__count` with text like "5/5".
   */
  private async scrapeSkillTree(page: Page): Promise<ISkillAllocation[]> {
    await this.clickTab(page, 'Skill Tree')

    // Wait for skill tree to render
    await page.waitForSelector('.skill__tree__item', { timeout: 10000 }).catch(() => {})

    const skills = await page
      .$$eval('.skill__tree__item--active', (nodes) => {
        return nodes
          .map((node) => {
            // Skill name is embedded in the CSS classes — look for the last
            // meaningful class that isn't a position/state class
            const classes = node.className.split(/\s+/)
            const skipClasses = new Set([
              'skill__tree__item',
              'skill__tree__item--active',
              'skill__tree__item--cap',
              'large',
              'small',
              'diamond',
              'after_bottom',
              'after_bottom_long',
              'after_top',
              'after_left',
              'after_right',
              'before_bottom',
              'before_top'
            ])
            // Filter to classes that look like skill names and aren't positional
            const nameClasses = classes.filter(
              (c) =>
                !skipClasses.has(c) && !c.match(/^r\d+$/) && !c.match(/^c\d+$/) && c.trim() !== ''
            )
            const rawName = nameClasses[nameClasses.length - 1] || 'Unknown'

            // Convert snake_case/camelCase to readable
            const skillName = rawName
              .replace(/_/g, ' ')
              .replace(/([a-z])([A-Z])/g, '$1 $2')
              .replace(/\b\w/g, (c) => c.toUpperCase())

            // Parse point allocation from ".skill__tree__item__count"
            const countEl = node.querySelector('.skill__tree__item__count')
            const countText = countEl?.textContent?.trim() || ''
            const match = countText.match(/(\d+)\s*\/\s*(\d+)/)

            const points = match ? parseInt(match[1], 10) : 1
            const maxPoints = match ? parseInt(match[2], 10) : 1

            // Skip nodes with 0 points allocated
            if (points === 0) return null

            // Determine type by element size/shape classes
            const isDiamond = classes.includes('diamond')
            const isLarge = classes.includes('large')
            let nodeType: 'active' | 'passive' | 'keystone' = 'passive'
            if (isLarge) nodeType = 'active'
            if (isDiamond) nodeType = 'passive'

            return {
              skillName,
              points,
              maxPoints,
              tier: 'core',
              nodeType
            }
          })
          .filter(Boolean)
      })
      .catch(() => [] as ISkillAllocation[])

    return skills as ISkillAllocation[]
  }

  /**
   * Clicks the "Paragon" tab and extracts board data.
   */
  private async scrapeParagon(page: Page): Promise<IParagonBoard[]> {
    await this.clickTab(page, 'Paragon')

    // Wait for paragon content to load
    await page.waitForSelector('[class*="paragon"]', { timeout: 10000 }).catch(() => {})

    const boards = await page
      .$$eval('[class*="paragon__board__name"]', (nameEls) => {
        return nameEls.map((el, index) => {
          const boardName = el.textContent?.trim() || `Board ${index + 1}`
          return {
            boardName,
            boardIndex: index,
            glyph: null,
            allocatedNodes: []
          }
        })
      })
      .catch(() => [] as IParagonBoard[])

    return boards
  }

  /**
   * Extracts gear data from the Gear & Skills tab.
   * Each gear item is `.builder__gear__item` containing:
   *   `.builder__gear__name` — item name (with rarity class)
   *   `.builder__gear__slot` — slot label (Helm, Chest Armor, etc.)
   */
  private async scrapeGear(page: Page): Promise<IGearSlot[]> {
    // Wait for gear to be visible
    await page.waitForSelector('.builder__gear__item', { timeout: 10000 }).catch(() => {})

    const gearSlots = await page
      .$$eval('.builder__gear__item', (items) => {
        return items.map((item) => {
          const slotEl = item.querySelector('.builder__gear__slot')
          const slot = slotEl?.textContent?.trim() || 'Unknown Slot'

          const nameEl = item.querySelector('.builder__gear__name')
          const itemName = nameEl?.textContent?.trim() || null
          const nameClass = nameEl?.className || ''

          // Rarity from class: builder__gear__name--mythic, --unique, --legendary, --rare
          let itemType: 'Unique' | 'Legendary' | 'Rare' = 'Legendary'
          if (nameClass.includes('--mythic') || nameClass.includes('--unique')) {
            itemType = 'Unique'
          } else if (nameClass.includes('--rare')) {
            itemType = 'Rare'
          }

          return {
            slot,
            itemName,
            itemType,
            requiredAspect: itemName, // On d4builds, the name often IS the aspect
            priorityAffixes: [],
            temperingTargets: [],
            masterworkPriority: []
          }
        })
      })
      .catch(() => [] as IGearSlot[])

    return gearSlots
  }

  /**
   * Normalizes the class name to our D4Class type.
   */
  private normalizeClass(raw: string): D4Class {
    const lower = raw.toLowerCase()

    if (lower.includes('barbarian')) return 'Barbarian'
    if (lower.includes('druid')) return 'Druid'
    if (lower.includes('necromancer')) return 'Necromancer'
    if (lower.includes('rogue')) return 'Rogue'
    if (lower.includes('sorcerer') || lower.includes('sorceress')) return 'Sorcerer'
    if (lower.includes('spiritborn')) return 'Spiritborn'

    return 'Barbarian' // Fallback
  }
}
