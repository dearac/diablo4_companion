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
// VERIFIED selectors from live site (2026-03-16):
//
// Header:
//   h2.builder__header__description → build name ("Rob's Cpt. America (S12)")
//   img.builder__header__icon       → class in CSS class (e.g., "Paladin")
//
// Gear & Skills tab (default):
//   div.build__skill__wrapper → skill name in CSS class (PascalCase)
//   div.builder__gear__item  → gear slots
//   div.builder__gear__name  → item name (rarity via --mythic/--unique/--rare)
//   div.builder__gear__slot  → slot label (Helm, Chest Armor, etc.)
//
// Skill Tree tab:
//   button.skill__tree__item--active → allocated nodes
//   div.skill__tree__item__count     → point text like "5/5"
//   ⚠ Multiple .skill__tree__section.active exist simultaneously
//     (up to 7 sections, all marked active → skills appear 3-7×)
//     → MUST deduplicate by skill name
//
// Paragon tab:
//   div.paragon__board                → board container
//   div.paragon__board__name          → name (BUT includes child stat text)
//     → first text node only = board name
//   div.paragon__board__name__glyph   → glyph name like "(Spirit)"
//   div.paragon__board__tile--active  → allocated tiles
//
// Navigation:
//   button.builder__navigation__link → tab buttons (text: "Gear & Skills", etc.)
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
      // 1. Navigate — use 'domcontentloaded' because d4builds has
      //    persistent connections that prevent 'networkidle'
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })

      // 2. Wait for the build header to appear (proves dynamic content loaded)
      await page.waitForSelector('.builder__header__description', { timeout: 30000 })

      // 3. Extra settle time for JS hydration
      await page.waitForTimeout(2000)

      // 4. Extract metadata
      const buildName = await this.extractText(
        page,
        '.builder__header__description',
        'Unknown Build'
      )

      const d4ClassRaw = await page
        .$eval('.builder__header__icon', (el) => {
          const classes = el.className.split(/\s+/)
          return classes.find((c) => c !== 'builder__header__icon') || 'Unknown'
        })
        .catch(() => 'Unknown')
      const d4Class = this.normalizeClass(d4ClassRaw)

      // 5. Extract active skills from Gear & Skills tab (simpler, no duplication)
      const activeSkills = await this.scrapeActiveSkills(page)

      // 6. Click "Skill Tree" tab for point allocations
      const skillAllocations = await this.scrapeSkillTree(page)

      // 7. Click "Paragon" tab for board data
      const paragonBoards = await this.scrapeParagon(page)

      // 8. Go back to "Gear & Skills" tab for gear data
      await this.clickTab(page, 'Gear')
      await page.waitForTimeout(1000)
      const gearSlots = await this.scrapeGear(page)

      // Use skill tree allocations (deduplicated), fall back to active skills
      const skills = skillAllocations.length > 0 ? skillAllocations : activeSkills

      return {
        name: buildName,
        d4Class,
        level: 100,
        skills,
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
   * Safely extracts text from a single element.
   * Returns fallback if the element isn't found.
   */
  private async extractText(page: Page, selector: string, fallback: string): Promise<string> {
    try {
      return await page.$eval(selector, (el) => el.textContent?.trim() || '')
    } catch {
      return fallback
    }
  }

  /**
   * Clicks a builder navigation tab by matching text.
   */
  private async clickTab(page: Page, tabText: string): Promise<void> {
    try {
      const tab = page.locator('.builder__navigation__link', { hasText: tabText }).first()
      await tab.click({ timeout: 5000 })
      await page.waitForTimeout(1500)
    } catch {
      console.warn(`Tab "${tabText}" not found, skipping`)
    }
  }

  /**
   * Extracts active skill names from the Gear & Skills tab.
   * Each skill is a button.builder__skill containing a
   * div.build__skill__wrapper whose CSS class has the skill name in PascalCase.
   * This is a simple, non-duplicating source of skill names.
   */
  private async scrapeActiveSkills(page: Page): Promise<ISkillAllocation[]> {
    try {
      return await page.$$eval('.build__skill__wrapper', (wrappers) => {
        return wrappers.map((wrapper) => {
          const classes = wrapper.className.split(/\s+/)
          const skillClass =
            classes.find((c) => c !== 'build__skill__wrapper' && c.trim() !== '') || 'Unknown'
          const skillName = skillClass.replace(/([a-z])([A-Z])/g, '$1 $2')
          return {
            skillName,
            points: 1,
            maxPoints: 1,
            tier: 'active' as const,
            nodeType: 'active' as const
          }
        })
      })
    } catch {
      return []
    }
  }

  /**
   * Clicks "Skill Tree" tab and extracts allocated nodes.
   *
   * CRITICAL: d4builds renders multiple .skill__tree__section elements
   * (up to 7) ALL marked as .active simultaneously. This means
   * .skill__tree__item--active returns 3-7x duplicates.
   *
   * Fix: Deduplicate by skill name using a Map (first occurrence wins
   * for point allocation).
   */
  private async scrapeSkillTree(page: Page): Promise<ISkillAllocation[]> {
    await this.clickTab(page, 'Skill Tree')
    await page.waitForSelector('.skill__tree__item', { timeout: 10000 }).catch(() => {})

    try {
      const rawSkills = await page.$$eval('.skill__tree__item--active', (nodes) => {
        return nodes
          .map((node) => {
            // PRIMARY: Use img alt text for clean skill name
            // e.g., alt="Punishment" instead of CSS class "punishment_clash"
            const imgEl = node.querySelector('img')
            const altText = imgEl?.getAttribute('alt') || ''
            if (!altText) return null

            // Convert camelCase/PascalCase to spaced
            const skillName = altText
              .replace(/([a-z])([A-Z])/g, '$1 $2')
              .replace(/\b\w/g, (c) => c.toUpperCase())

            const countEl = node.querySelector('.skill__tree__item__count')
            const countText = countEl?.textContent?.trim() || ''
            const match = countText.match(/(\d+)\s*\/\s*(\d+)/)
            const points = match ? parseInt(match[1], 10) : 1
            const maxPoints = match ? parseInt(match[2], 10) : 1

            if (points === 0) return null

            const classes = node.className.split(/\s+/)
            const isDiamond = classes.includes('diamond')
            const isLarge = classes.includes('large')
            let nodeType: 'active' | 'passive' | 'keystone' = 'passive'
            if (isLarge) nodeType = 'active'
            if (isDiamond) nodeType = 'passive'

            return { skillName, points, maxPoints, tier: 'core', nodeType }
          })
          .filter(Boolean)
      })

      // DEDUPLICATE: Multiple sections show the same skills
      // Use a Map keyed by skill name — first occurrence wins
      const seen = new Map<string, ISkillAllocation>()
      for (const skill of rawSkills as ISkillAllocation[]) {
        if (!seen.has(skill.skillName)) {
          seen.set(skill.skillName, skill)
        }
      }
      return Array.from(seen.values())
    } catch {
      return []
    }
  }

  /**
   * Clicks "Paragon" tab and extracts board names.
   *
   * The .paragon__board__name element contains child elements with stat text,
   * so we only extract from the FIRST child text node to get the clean name.
   * The glyph name is in .paragon__board__name__glyph.
   */
  private async scrapeParagon(page: Page): Promise<IParagonBoard[]> {
    await this.clickTab(page, 'Paragon')
    await page.waitForSelector('.paragon__board', { timeout: 10000 }).catch(() => {})

    try {
      return await page.$$eval('.paragon__board', (boards) => {
        return boards.map((board, index) => {
          // Get board name — extract ONLY direct text nodes
          const nameEl = board.querySelector('.paragon__board__name')
          let boardName = `Board ${index + 1}`
          if (nameEl) {
            const textParts: string[] = []
            nameEl.childNodes.forEach((node) => {
              if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent?.trim()
                if (text) textParts.push(text)
              }
            })
            const rawName = textParts.join(' ').trim()
            boardName = rawName.replace(/^\d+\s*/, '').trim() || rawName
          }

          // Get glyph name
          const glyphEl = board.querySelector('.paragon__board__name__glyph')
          const glyphText = glyphEl?.textContent?.trim() || null
          const glyphName = glyphText ? glyphText.replace(/[()]/g, '').trim() : null

          // Collect ALL nodes for full board representation
          const allTiles = board.querySelectorAll('.paragon__board__tile')

          // Board background and rotation
          const boardStyle = board.getAttribute('style') || ''
          const boardRotMatch = boardStyle.match(/rotate\(([-0-9]+)deg\)/)
          const boardRotation = boardRotMatch ? parseInt(boardRotMatch[1], 10) : 0
          const boardBgUrl = 'https://sunderarmor.com/DIABLO4/Paragon/board_bg.png' // Default bg from site

          // Collect ALL nodes for visual path rendering
          const allocatedNodes: Array<{
            nodeName: string
            nodeType: 'normal' | 'magic' | 'rare' | 'legendary' | 'gate'
            allocated: boolean
            row?: number
            col?: number
            iconUrl?: string
            activeIconUrl?: string
            bgUrl?: string
            styleTransform?: string
          }> = []

          allTiles.forEach((tile) => {
            // Find images (icon, active icon, background)
            const iconImg = Array.from(
              tile.querySelectorAll('img.paragon__board__tile__icon')
            ).find((img) => !img.classList.contains('active'))
            const activeIconImg = tile.querySelector('img.paragon__board__tile__icon.active')
            const bgImg = tile.querySelector('img.paragon__board__tile__bg')

            const iconUrl = iconImg?.getAttribute('src') || undefined
            const activeIconUrl = activeIconImg?.getAttribute('src') || undefined
            const bgUrl = bgImg?.getAttribute('src') || undefined

            const altText = iconImg?.getAttribute('alt')?.trim() || 'Node'
            const styleTransform = tile.getAttribute('style') || undefined // e.g. transform: rotate(-90deg)
            const allocated = tile.classList.contains('active')

            // Extract row/col from CSS (e.g., "r5 c10")
            const tileClasses = tile.className.toLowerCase()
            const matchRow = tileClasses.match(/\br(\d+)\b/)
            const matchCol = tileClasses.match(/\bc(\d+)\b/)
            const row = matchRow ? parseInt(matchRow[1], 10) : undefined
            const col = matchCol ? parseInt(matchCol[1], 10) : undefined

            // Determine node type — PRIMARY: use the bg tile image alt text
            // which tells us Common, Magic, Rare, or Legendary. The CSS
            // classes do NOT reliably carry type info on d4builds.gg.
            // Fallback: check for 'radius' class (rare node indicator on d4builds).
            const bgAlt = bgImg?.getAttribute('alt')?.toLowerCase() || ''
            let nodeType: 'normal' | 'magic' | 'rare' | 'legendary' | 'gate' = 'normal'
            if (bgAlt.includes('legendary')) nodeType = 'legendary'
            else if (bgAlt.includes('rare')) nodeType = 'rare'
            else if (bgAlt.includes('magic')) nodeType = 'magic'
            else if (tileClasses.includes('radius')) nodeType = 'rare'
            else if (altText.toLowerCase() === 'gate' || tileClasses.includes('gate'))
              nodeType = 'gate'

            // Format the name nicely — split PascalCase and known stat
            // abbreviations into human-readable text
            const nodeName = altText
              .replace(/([a-z])([A-Z])/g, '$1 $2') // Split camelCase
              .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // Split consecutive caps
              .replace(/\b\w/g, (c) => c.toUpperCase())

            allocatedNodes.push({
              nodeName,
              nodeType,
              allocated,
              row,
              col,
              iconUrl,
              activeIconUrl,
              bgUrl,
              styleTransform
            })
          })

          return {
            boardName,
            boardIndex: index,
            glyph: glyphName ? { glyphName, level: 15 } : null,
            allocatedNodes,
            boardRotation,
            boardBgUrl
          }
        })
      })
    } catch {
      return []
    }
  }

  /**
   * Extracts gear data from the Gear & Skills tab.
   */
  private async scrapeGear(page: Page): Promise<IGearSlot[]> {
    await page.waitForSelector('.builder__gear__item', { timeout: 10000 }).catch(() => {})

    try {
      return await page.$$eval('.builder__gear__item', (items) => {
        return items.map((item) => {
          const slotEl = item.querySelector('.builder__gear__slot')
          const slot = slotEl?.textContent?.trim() || 'Unknown Slot'

          const nameEl = item.querySelector('.builder__gear__name')
          const itemName = nameEl?.textContent?.trim() || null
          const nameClass = nameEl?.className || ''

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
            requiredAspect: itemName,
            priorityAffixes: [],
            temperingTargets: [],
            masterworkPriority: []
          }
        })
      })
    } catch {
      return []
    }
  }

  /**
   * Normalizes the class name to our D4Class type.
   * Includes "Paladin" as a valid class since D4 Season 12 added it.
   */
  private normalizeClass(raw: string): D4Class {
    const lower = raw.toLowerCase()

    if (lower.includes('barbarian')) return 'Barbarian'
    if (lower.includes('druid')) return 'Druid'
    if (lower.includes('necromancer')) return 'Necromancer'
    if (lower.includes('rogue')) return 'Rogue'
    if (lower.includes('sorcerer') || lower.includes('sorceress')) return 'Sorcerer'
    if (lower.includes('spiritborn')) return 'Spiritborn'
    if (lower.includes('paladin')) return 'Paladin' as D4Class

    return 'Barbarian' // Fallback
  }
}
