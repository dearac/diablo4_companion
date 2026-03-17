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
// IcyVeinsScraper — Scraper for icy-veins.com D4 build guides
// ============================================================
// Icy Veins publishes editorial build guides at URLs like:
//   https://www.icy-veins.com/d4/rogue-build-guide
//
// Their page structure uses semantic HTML with clear headings
// and structured sections. Skills are listed in ordered or
// unordered lists within a Skills section, with each item
// containing the skill name and point allocation.
// ============================================================

/**
 * Scraper for icy-veins.com D4 build guides.
 * Uses Playwright to extract data from Icy Veins' editorial pages.
 */
export class IcyVeinsScraper extends BuildScraper {
  readonly siteName = 'icy-veins.com'
  readonly sourceKey: BuildSourceSite = 'icy-veins'

  /**
   * Checks if this scraper can handle the given URL.
   * Matches icy-veins.com/d4/ URLs — we require the /d4/ segment
   * to avoid matching non-Diablo content on the same domain.
   */
  canHandle(url: string): boolean {
    const normalized = url.toLowerCase().trim()
    return normalized.includes('icy-veins.com/d4/')
  }

  /**
   * Scrapes the build data from the given URL.
   *
   * @param url - The Icy Veins build guide URL
   */
  async scrape(url: string): Promise<RawBuildData> {
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    })
    const page = await context.newPage()

    try {
      // 1. Navigate to the build guide
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })

      // 2. Wait for the main heading to appear
      // Icy Veins uses a standard <h1> for the build guide title
      await page.waitForSelector('.page-title, h1.guide-title, h1', { timeout: 30000 })

      // 3. Extract Metadata
      // The <h1> typically reads like "Heartseeker Rogue Build Guide"
      const buildName = await page.$eval(
        '.page-title, h1.guide-title, h1',
        (el) => el.textContent?.trim() || 'Unknown Build'
      )

      // 4. Infer the class from the page title
      // Icy Veins titles always contain the class name, e.g.:
      //   "Heartseeker Rogue Build Guide"
      //   "Minion Necromancer Build Guide"
      const d4Class = this.normalizeClass(buildName)

      // 5. Extract Skills
      const skills = await this.scrapeSkills(page)

      // 6. Extract Paragon boards
      const paragonBoards = await this.scrapeParagon(page)

      // 7. Extract Gear slots
      const gearSlots = await this.scrapeGear(page)

      return {
        name: buildName,
        d4Class: d4Class,
        level: 100,
        skills,
        paragonBoards,
        gearSlots
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`Scraping failed for ${url}:`, message)
      throw new Error(`Failed to scrape Icy Veins build: ${message}`)
    } finally {
      await browser.close()
    }
  }

  /**
   * Extracts skill allocations from Icy Veins' editorial skill lists.
   *
   * Icy Veins uses semantic HTML for skills — typically an ordered or
   * unordered list where each item contains:
   * - The skill name (in a link, bold, or span element)
   * - Point allocation as parenthetical text like "(5/5)"
   *
   * @param page - The Playwright page, already on the guide
   * @returns Array of skill allocations found in the list
   */
  private async scrapeSkills(page: Page): Promise<ISkillAllocation[]> {
    // Try to find and click a Skills section anchor/tab
    const skillsSection = await page.$(
      'a[href*="skills"], [data-section="skills"], h2:has-text("Skills")'
    )
    if (skillsSection) {
      await skillsSection.click().catch(() => {
        // Section link may not be clickable or may be a heading
      })
    }

    // Extract skill list items from the skills section
    // Icy Veins typically uses li elements inside a skills list
    const skills = await page.$$eval(
      '.skill-list__item, .skills-list li, .skill-entry, section.skills li',
      (items) => {
        return items.map((item) => {
          // Try to get skill name from a dedicated element first
          const nameEl = item.querySelector('.skill-name, a, strong') || item.querySelector('span')
          const skillName = nameEl?.textContent?.trim() || 'Unknown Skill'

          // Parse point allocation from text like "(5/5)" or "5/5"
          const fullText = item.textContent || ''
          const pointsMatch = fullText.match(/(\d+)\s*\/\s*(\d+)/)

          const points = pointsMatch ? parseInt(pointsMatch[1], 10) : 1
          const maxPoints = pointsMatch ? parseInt(pointsMatch[2], 10) : 1

          return {
            skillName,
            points,
            maxPoints,
            tier: 'core', // Icy Veins editorial format doesn't expose tiers
            nodeType: 'active' as const
          }
        })
      }
    )

    return skills
  }

  /**
   * Extracts paragon board data from Icy Veins' editorial paragon section.
   *
   * Icy Veins uses sections or div containers for paragon boards, each with:
   * - A heading (h3/h4) or `.board-name` element for the board name
   * - A glyph element with name and level
   * - Node elements with type class modifiers
   *
   * @param page - The Playwright page, already on the guide
   * @returns Array of paragon boards
   */
  private async scrapeParagon(page: Page): Promise<IParagonBoard[]> {
    // Try to navigate to the paragon section
    const paragonSection = await page.$(
      'a[href*="paragon"], [data-section="paragon"], h2:has-text("Paragon")'
    )
    if (paragonSection) {
      await paragonSection.click().catch(() => {
        // Section link may not be clickable
      })
    }

    // Extract paragon board containers
    const boards = await page.$$eval(
      '.paragon-board, .paragon_board, section.paragon .board',
      (boardEls) => {
        return boardEls.map((board, index) => {
          // Board name from heading or dedicated element
          const nameEl =
            board.querySelector('.board-name, h3, h4') ||
            board.querySelector('[class*="board-name"]')
          const boardName = nameEl?.textContent?.trim() || `Board ${index + 1}`

          // Glyph info (may not exist)
          const glyphEl = board.querySelector('[class*="glyph"]')
          let glyph: { glyphName: string; level: number } | null = null
          if (glyphEl) {
            const glyphNameEl = glyphEl.querySelector('[class*="name"]')
            const glyphLevelEl = glyphEl.querySelector('[class*="level"]')
            const glyphName = glyphNameEl?.textContent?.trim() || 'Unknown Glyph'
            const level = parseInt(glyphLevelEl?.textContent?.trim() || '1', 10)
            glyph = { glyphName, level }
          }

          // Allocated nodes
          const nodeEls = board.querySelectorAll('[class*="paragon-node"], [class*="node"]')
          const allocatedNodes: Array<{
            nodeName: string
            nodeType: 'normal' | 'magic' | 'rare' | 'legendary'
            allocated: boolean
          }> = []

          nodeEls.forEach((nodeEl) => {
            const nodeNameEl = nodeEl.querySelector('[class*="name"]')
            const nodeName = nodeNameEl?.textContent?.trim() || 'Unknown Node'
            const classStr = nodeEl.className || ''

            let nodeType: 'normal' | 'magic' | 'rare' | 'legendary' = 'normal'
            if (classStr.includes('legendary')) {
              nodeType = 'legendary'
            } else if (classStr.includes('rare')) {
              nodeType = 'rare'
            } else if (classStr.includes('magic')) {
              nodeType = 'magic'
            }

            allocatedNodes.push({ nodeName, nodeType, allocated: true })
          })

          return {
            boardName,
            boardIndex: index,
            glyph,
            allocatedNodes
          }
        })
      }
    )

    return boards
  }

  /**
   * Extracts gear slot data from Icy Veins' editorial gear section.
   *
   * Icy Veins uses various elements for gear recommendations:
   * - `.gear-slot` containers with slot name, item info, aspect, affixes
   * - Headings (h4/strong) for slot names
   * - Item names with type indicators
   *
   * @param page - The Playwright page, already on the guide
   * @returns Array of gear slots with all equipment details
   */
  private async scrapeGear(page: Page): Promise<IGearSlot[]> {
    const gearSlots = await page.$$eval(
      '.gear-slot, [class*="gear-slot"], [class*="equipment"], section.gear .slot',
      (slotEls) => {
        return slotEls.map((slotEl, index) => {
          // Slot name
          const slotNameEl = slotEl.querySelector('.slot-name, h4, strong, [class*="slot-name"]')
          const slot = slotNameEl?.textContent?.trim() || `Slot ${index + 1}`

          // Item name and type
          const itemEl = slotEl.querySelector('.item-name, [class*="item-name"]')
          const itemName = itemEl?.textContent?.trim() || null
          const itemClass = (itemEl as HTMLElement)?.className || ''

          let itemType: 'Unique' | 'Legendary' | 'Rare' = 'Legendary'
          if (itemClass.includes('unique') || itemClass.includes('Unique')) {
            itemType = 'Unique'
          } else if (itemClass.includes('rare') || itemClass.includes('Rare')) {
            itemType = 'Rare'
          }

          // Required aspect
          const aspectEl = slotEl.querySelector('.aspect, [class*="aspect"]')
          const requiredAspect = aspectEl?.textContent?.trim() || null

          // Priority affixes
          const affixEls = slotEl.querySelectorAll('.affix, [class*="affix"]')
          const priorityAffixes: Array<{ name: string; priority: number }> = []
          affixEls.forEach((affixEl, affixIndex) => {
            const name = affixEl.textContent?.trim() || ''
            if (name) priorityAffixes.push({ name, priority: affixIndex + 1 })
          })

          // Tempering targets
          const temperEls = slotEl.querySelectorAll('.temper, [class*="temper"]')
          const temperingTargets: string[] = []
          temperEls.forEach((el) => {
            const text = el.textContent?.trim() || ''
            if (text) temperingTargets.push(text)
          })

          // Masterwork priorities
          const masterworkEls = slotEl.querySelectorAll('.masterwork, [class*="masterwork"]')
          const masterworkPriority: string[] = []
          masterworkEls.forEach((el) => {
            const text = el.textContent?.trim() || ''
            if (text) masterworkPriority.push(text)
          })

          return {
            slot,
            itemName,
            itemType,
            requiredAspect,
            priorityAffixes,
            temperingTargets,
            masterworkPriority
          }
        })
      }
    )

    return gearSlots
  }

  /**
   * Normalizes the class name from the Icy Veins page title.
   * Titles are typically like "Heartseeker Rogue Build Guide",
   * so we search for known class names in the string.
   */
  private normalizeClass(raw: string): D4Class {
    const lower = raw.toLowerCase()

    if (lower.includes('barbarian')) return 'Barbarian'
    if (lower.includes('druid')) return 'Druid'
    if (lower.includes('necromancer')) return 'Necromancer'
    if (lower.includes('rogue')) return 'Rogue'
    if (lower.includes('sorcerer') || lower.includes('sorceress')) return 'Sorcerer'
    if (lower.includes('spiritborn')) return 'Spiritborn'
    if (lower.includes('witch doctor')) return 'Witch Doctor'

    // Fallback for unexpected title formats
    return 'Barbarian'
  }
}
