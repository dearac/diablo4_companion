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
// MaxrollScraper — Scraper for maxroll.gg D4 build planner
// ============================================================
// Maxroll's planner is a single-page app with tabbed panels.
// The Skills tab renders a visual skill tree where allocated
// skills are highlighted. We click tabs and read the DOM to
// extract build data.
//
// SELECTORS NOTE: Maxroll uses CSS modules, so class names
// are hashed (e.g., "skillTree_SkillNode__abc123"). We use
// [class*="..."] partial matches to tolerate hash changes.
// ============================================================

/**
 * Scraper for maxroll.gg builds.
 * Uses Playwright to extract data from the Maxroll planner.
 */
export class MaxrollScraper extends BuildScraper {
  readonly siteName = 'maxroll.gg'
  readonly sourceKey: BuildSourceSite = 'maxroll'

  /**
   * Checks if this scraper can handle the given URL.
   * Matches maxroll.gg/d4/planner/ URLs.
   */
  canHandle(url: string): boolean {
    const normalized = url.toLowerCase().trim()
    return normalized.includes('maxroll.gg/d4/planner/')
  }

  /**
   * Scrapes the build data from the given URL.
   * This uses Playwright to navigate to the page and extract the DOM.
   *
   * @param url - The Maxroll planner URL
   */
  async scrape(url: string): Promise<RawBuildData> {
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    })
    const page = await context.newPage()

    try {
      // 1. Navigate to the planner
      await page.goto(url, { waitUntil: 'networkidle' })

      // 2. Wait for the title to appear (signals hydration)
      // Maxroll uses CSS modules so we use a contains selector for buildTitle
      await page.waitForSelector('div[class*="header_Header__buildTitle"]', { timeout: 30000 })

      // 3. Extract Metadata
      const buildName = await page.$eval(
        'div[class*="header_Header__buildTitle"]',
        (el) => el.textContent?.trim() || 'Unknown Build'
      )

      const d4ClassRaw = await page.$eval(
        'div[class*="equipment_SelectValue"] span:nth-child(2)',
        (el) => el.textContent?.trim() || 'Barbarian'
      )

      const d4Class = this.normalizeClass(d4ClassRaw)

      // 4. Extract Skills
      const skills = await this.scrapeSkills(page)

      // 5. Extract Paragon boards
      const paragonBoards = await this.scrapeParagon(page)

      // 6. Extract Gear slots
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
      throw new Error(`Failed to scrape Maxroll build: ${message}`)
    } finally {
      await browser.close()
    }
  }

  /**
   * Switches to the Skills tab and extracts all allocated skill nodes.
   *
   * Maxroll's skill tree renders each node as a div with a class like
   * "skillTree_SkillNode__..." and marks allocated nodes with an
   * "allocated" or "active" modifier class. Each node contains the
   * skill name and point allocation (e.g., "5/5").
   *
   * @param page - The Playwright page, already on the planner
   * @returns Array of skill allocations found in the tree
   */
  private async scrapeSkills(page: Page): Promise<ISkillAllocation[]> {
    // Click the "Skills" tab to switch to the skill tree panel
    // Maxroll uses tabs with text labels like "Skills", "Paragon", etc.
    const skillsTab = await page.$(
      'button[class*="skillTree"], [data-tab="skills"], button:has-text("Skills")'
    )
    if (skillsTab) {
      await skillsTab.click()
      // Wait for the skill tree container to render
      await page
        .waitForSelector('[class*="skillTree_SkillTree"], [class*="skill-tree"]', {
          timeout: 10000
        })
        .catch(() => {
          // Skill tree may already be visible on some layouts
        })
    }

    // Extract all skill nodes that have points allocated
    // Each node has a name, allocated points, and max points displayed
    const skills = await page.$$eval(
      '[class*="skillTree_SkillNode"][class*="allocated"], [class*="skillTree_SkillNode"][class*="active"], [class*="skill-node"][class*="allocated"]',
      (nodes) => {
        return nodes.map((node) => {
          // The skill name is typically in a span or the node's text
          const nameEl = node.querySelector('[class*="name"], [class*="label"], span')
          const skillName =
            nameEl?.textContent?.trim() || node.textContent?.trim() || 'Unknown Skill'

          // Point allocation is displayed as "X/Y" (e.g., "5/5")
          const pointsEl = node.querySelector('[class*="points"], [class*="rank"]')
          const pointsText = pointsEl?.textContent?.trim() || ''
          const pointsMatch = pointsText.match(/(\d+)\s*\/\s*(\d+)/)

          const points = pointsMatch ? parseInt(pointsMatch[1], 10) : 1
          const maxPoints = pointsMatch ? parseInt(pointsMatch[2], 10) : 1

          // Determine the tier from the node's position or parent container
          const tier =
            node.closest('[class*="tier"]')?.getAttribute('data-tier') ||
            node.getAttribute('data-tier') ||
            'core'

          // Determine the node type from CSS classes or attributes
          const classStr = node.className || ''
          let nodeType: 'active' | 'passive' | 'keystone' = 'active'
          if (classStr.includes('passive') || classStr.includes('Passive')) {
            nodeType = 'passive'
          } else if (
            classStr.includes('keystone') ||
            classStr.includes('Keystone') ||
            classStr.includes('ultimate')
          ) {
            nodeType = 'keystone'
          }

          return {
            skillName,
            points,
            maxPoints,
            tier,
            nodeType
          }
        })
      }
    )

    return skills
  }

  /**
   * Switches to the Paragon tab and extracts all board data.
   *
   * Maxroll's paragon section renders each board as a container with:
   * - `[class*="boardName"]` — the board's display name
   * - `[class*="glyph"]` — the socket glyph (name + level)
   * - `[class*="paragonNode"]` — individual nodes with type modifiers
   *
   * @param page - The Playwright page, already on the planner
   * @returns Array of paragon boards with glyphs and allocated nodes
   */
  private async scrapeParagon(page: Page): Promise<IParagonBoard[]> {
    // Click the "Paragon" tab to switch to the paragon panel
    const paragonTab = await page.$(
      'button:has-text("Paragon"), [data-tab="paragon"], button[class*="paragon"]'
    )
    if (paragonTab) {
      await paragonTab.click()
      await page.waitForSelector('[class*="paragonBoard"]', { timeout: 10000 }).catch(() => {
        // Paragon section may already be visible
      })
    }

    // Extract all paragon board containers
    const boards = await page.$$eval('[class*="paragonBoard"]', (boardEls) => {
      return boardEls.map((board, index) => {
        // Board name from the header element
        const nameEl = board.querySelector('[class*="boardName"]')
        const boardName = nameEl?.textContent?.trim() || `Board ${index + 1}`

        // Glyph info (may not exist on every board)
        const glyphEl = board.querySelector('[class*="glyph"]')
        let glyph: { glyphName: string; level: number } | null = null
        if (glyphEl) {
          const glyphNameEl = glyphEl.querySelector('[class*="name"]')
          const glyphLevelEl = glyphEl.querySelector('[class*="level"]')
          const glyphName = glyphNameEl?.textContent?.trim() || 'Unknown Glyph'
          const level = parseInt(glyphLevelEl?.textContent?.trim() || '1', 10)
          glyph = { glyphName, level }
        }

        // Allocated nodes with type classification
        const nodeEls = board.querySelectorAll('[class*="paragonNode"]')
        const allocatedNodes: Array<{
          nodeName: string
          nodeType: 'normal' | 'magic' | 'rare' | 'legendary'
          allocated: boolean
        }> = []

        nodeEls.forEach((nodeEl) => {
          const nodeNameEl = nodeEl.querySelector('[class*="name"]')
          const nodeName = nodeNameEl?.textContent?.trim() || 'Unknown Node'
          const classStr = nodeEl.className || ''

          // Determine node type from CSS class modifiers
          let nodeType: 'normal' | 'magic' | 'rare' | 'legendary' = 'normal'
          if (classStr.includes('legendary')) {
            nodeType = 'legendary'
          } else if (classStr.includes('rare')) {
            nodeType = 'rare'
          } else if (classStr.includes('magic')) {
            nodeType = 'magic'
          }

          allocatedNodes.push({
            nodeName,
            nodeType,
            allocated: true
          })
        })

        return {
          boardName,
          boardIndex: index,
          glyph,
          allocatedNodes
        }
      })
    })

    return boards
  }

  /**
   * Extracts gear slot data from Maxroll's equipment section.
   *
   * Maxroll displays equipment on the default tab, each slot as:
   * - `[class*="equipment_Slot"]` — the slot container
   * - `[class*="equipment_SlotName"]` or `[class*="slot"]` — slot name (Helm, Chest, etc.)
   * - `[class*="equipment_ItemName"]` — item name + class modifier for type
   * - `[class*="equipment_Aspect"]` — the required aspect (null for Uniques)
   * - `[class*="affix"]` — priority affixes listed
   * - `[class*="temper"]` — tempering targets
   * - `[class*="masterwork"]` — masterwork priorities
   *
   * @param page - The Playwright page, already on the planner
   * @returns Array of gear slots with all equipment details
   */
  private async scrapeGear(page: Page): Promise<IGearSlot[]> {
    // Equipment is on the default tab — no tab switch needed
    const gearSlots = await page.$$eval(
      '[class*="equipment_Slot"], [class*="equipment-slot"]',
      (slotEls) => {
        return slotEls.map((slotEl, index) => {
          // Slot name (Helm, Chest, Gloves, etc.)
          const slotNameEl = slotEl.querySelector(
            '[class*="SlotName"], [class*="slot-name"], [class*="slot"]'
          )
          const slot = slotNameEl?.textContent?.trim() || `Slot ${index + 1}`

          // Item name and type detection
          const itemEl = slotEl.querySelector('[class*="ItemName"], [class*="item-name"]')
          const itemName = itemEl?.textContent?.trim() || null
          const itemClass = (itemEl as HTMLElement)?.className || ''

          let itemType: 'Unique' | 'Legendary' | 'Rare' = 'Legendary'
          if (itemClass.includes('unique') || itemClass.includes('Unique')) {
            itemType = 'Unique'
          } else if (itemClass.includes('rare') || itemClass.includes('Rare')) {
            itemType = 'Rare'
          }

          // Required aspect (null for Unique items)
          const aspectEl = slotEl.querySelector('[class*="Aspect"], [class*="aspect"]')
          const requiredAspect = aspectEl?.textContent?.trim() || null

          // Priority affixes with index-based priority
          const affixEls = slotEl.querySelectorAll('[class*="affix"], [class*="Affix"]')
          const priorityAffixes: Array<{ name: string; priority: number }> = []
          affixEls.forEach((affixEl, affixIndex) => {
            const name = affixEl.textContent?.trim() || ''
            if (name) {
              priorityAffixes.push({ name, priority: affixIndex + 1 })
            }
          })

          // Tempering targets
          const temperEls = slotEl.querySelectorAll('[class*="temper"], [class*="Temper"]')
          const temperingTargets: string[] = []
          temperEls.forEach((el) => {
            const text = el.textContent?.trim() || ''
            if (text) temperingTargets.push(text)
          })

          // Masterwork priorities
          const masterworkEls = slotEl.querySelectorAll(
            '[class*="masterwork"], [class*="Masterwork"]'
          )
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
   * Normalizes the class name from Maxroll's UI to our D4Class type.
   */
  private normalizeClass(raw: string): D4Class {
    const cls = raw.trim()
    // Direct matches with D4Class type
    const validClasses: string[] = [
      'Barbarian',
      'Druid',
      'Necromancer',
      'Rogue',
      'Sorcerer',
      'Spiritborn',
      'Witch Doctor'
    ]

    if (validClasses.includes(cls)) {
      return cls as D4Class
    }

    // Fallback for unexpected class strings
    return 'Barbarian'
  }
}
