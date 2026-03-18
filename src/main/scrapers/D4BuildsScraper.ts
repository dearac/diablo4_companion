import { chromium, Page } from 'playwright'
import { BuildScraper, RawBuildData } from './BuildScraper'
import { ProcessManager } from '../services/ProcessManager'
import { getBrowserPath } from '../services/BrowserPath'
import {
  BuildSourceSite,
  D4Class,
  ISkillAllocation,
  IParagonBoard,
  IGearSlot,
  IRune
} from '../../shared/types'
import { ParagonCacheService, type CachedNodeData } from '../services/ParagonCacheService'

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

  /** Cache service for board layouts + tooltips (skips Phase B on cache hit) */
  private paragonCache: ParagonCacheService | null = null

  constructor(cacheDir?: string) {
    super()
    if (cacheDir) {
      this.paragonCache = new ParagonCacheService(cacheDir)
    }
  }

  /** Clears the paragon board cache (call after game updates) */
  clearCache(): void {
    this.paragonCache?.clear()
  }

  canHandle(url: string): boolean {
    const normalized = url.toLowerCase().trim()
    return normalized.includes('d4builds.gg/builds/')
  }

  async scrape(url: string): Promise<RawBuildData> {
    const browser = await chromium.launch({ headless: true, executablePath: getBrowserPath() })
    ProcessManager.getInstance().register(browser)
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

      // 9. Scrape active runes (separate from gear)
      const activeRunes = await this.scrapeRunes(page)

      // Use skill tree allocations (deduplicated), fall back to active skills
      const skills = skillAllocations.length > 0 ? skillAllocations : activeSkills

      return {
        name: buildName,
        d4Class,
        level: 100,
        skills,
        paragonBoards,
        gearSlots,
        activeRunes
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`Scraping failed for ${url}:`, message)
      throw new Error(`Failed to scrape D4Builds: ${message}`)
    } finally {
      await browser.close()
      ProcessManager.getInstance().unregister(browser)
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
      // ── Phase A: Extract tile metadata (fast, synchronous $$eval) ──
      const boardsData = await page.$$eval('.paragon__board', (boards) => {
        return boards.map((board, index) => {
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

          const glyphEl = board.querySelector('.paragon__board__name__glyph')
          const glyphText = glyphEl?.textContent?.trim() || null
          const glyphName = glyphText ? glyphText.replace(/[()]/g, '').trim() : null

          const allTiles = board.querySelectorAll('.paragon__board__tile')
          const boardStyle = board.getAttribute('style') || ''
          const boardRotMatch = boardStyle.match(/rotate\(([-0-9]+)deg\)/)
          const boardRotation = boardRotMatch ? parseInt(boardRotMatch[1], 10) : 0
          const boardBgUrl = 'https://sunderarmor.com/DIABLO4/Paragon/board_bg.png'

          // Extract CSS top/left positions (d4builds uses absolute positioning
          // with multiples of 1258px to arrange boards spatially)
          const topMatch = boardStyle.match(/top:\s*([-0-9.]+)px/)
          const leftMatch = boardStyle.match(/left:\s*([-0-9.]+)px/)
          const boardX = leftMatch ? parseFloat(leftMatch[1]) : 0
          const boardY = topMatch ? parseFloat(topMatch[1]) : 0

          const allocatedNodes: Array<{
            nodeName: string
            nodeType: 'normal' | 'magic' | 'rare' | 'legendary' | 'gate'
            allocated: boolean
            nodeDescription?: string
            row?: number
            col?: number
            iconUrl?: string
            activeIconUrl?: string
            bgUrl?: string
            styleTransform?: string
          }> = []

          allTiles.forEach((tile) => {
            const iconImg = Array.from(
              tile.querySelectorAll('img.paragon__board__tile__icon')
            ).find((img) => !img.classList.contains('active'))
            const activeIconImg = tile.querySelector('img.paragon__board__tile__icon.active')
            const bgImg = tile.querySelector('img.paragon__board__tile__bg')

            const iconUrl = iconImg?.getAttribute('src') || undefined
            const activeIconUrl = activeIconImg?.getAttribute('src') || undefined
            const bgUrl = bgImg?.getAttribute('src') || undefined

            const altText = iconImg?.getAttribute('alt')?.trim() || 'Node'
            const styleTransform = tile.getAttribute('style') || undefined
            const allocated = tile.classList.contains('active')

            const tileClasses = tile.className.toLowerCase()
            const matchRow = tileClasses.match(/\br(\d+)\b/)
            const matchCol = tileClasses.match(/\bc(\d+)\b/)
            const row = matchRow ? parseInt(matchRow[1], 10) : undefined
            const col = matchCol ? parseInt(matchCol[1], 10) : undefined

            const bgAlt = bgImg?.getAttribute('alt')?.toLowerCase() || ''
            let nodeType: 'normal' | 'magic' | 'rare' | 'legendary' | 'gate' = 'normal'
            if (bgAlt.includes('legendary')) nodeType = 'legendary'
            else if (bgAlt.includes('rare')) nodeType = 'rare'
            else if (bgAlt.includes('magic')) nodeType = 'magic'
            else if (tileClasses.includes('radius')) nodeType = 'rare'
            else if (altText.toLowerCase() === 'gate' || tileClasses.includes('gate'))
              nodeType = 'gate'

            const nodeName = altText
              .replace(/([a-z])([A-Z])/g, '$1 $2')
              .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
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
            boardBgUrl,
            boardX,
            boardY,
            tileCount: allTiles.length
          }
        })
      })

      // ── Phase B: Extract tooltip descriptions (with cache) ──
      const uncachedBoardIndices: number[] = []

      for (let bIdx = 0; bIdx < boardsData.length; bIdx++) {
        const boardData = boardsData[bIdx]
        const cachedNodes = this.paragonCache?.get(boardData.boardName)

        if (cachedNodes) {
          // CACHE HIT — merge descriptions from cache
          for (const node of boardData.allocatedNodes) {
            const cached = cachedNodes.find((c) => c.row === node.row && c.col === node.col)
            if (cached) {
              if (cached.nodeName) node.nodeName = cached.nodeName
              if (cached.nodeDescription) node.nodeDescription = cached.nodeDescription
            }
          }
        } else {
          uncachedBoardIndices.push(bIdx)
        }
      }

      // Only run expensive hover loop for uncached boards
      if (uncachedBoardIndices.length > 0) {
        const tileIndices: Array<{ boardIdx: number; tileIdx: number }> = []
        for (const bIdx of uncachedBoardIndices) {
          for (let tIdx = 0; tIdx < boardsData[bIdx].allocatedNodes.length; tIdx++) {
            const n = boardsData[bIdx].allocatedNodes[tIdx]
            if (
              n.allocated ||
              n.nodeType === 'rare' ||
              n.nodeType === 'legendary' ||
              n.nodeType === 'gate'
            ) {
              tileIndices.push({ boardIdx: bIdx, tileIdx: tIdx })
            }
          }
        }

        const allTooltipData = await page
          .evaluate(async (indices: Array<{ boardIdx: number; tileIdx: number }>) => {
            const delay = (ms: number): Promise<void> =>
              new Promise((resolve) => setTimeout(resolve, ms))
            const results: Array<{
              boardIdx: number
              tileIdx: number
              name: string | null
              description: string | null
            }> = []
            const boards = document.querySelectorAll('.paragon__board')
            for (const { boardIdx, tileIdx } of indices) {
              const board = boards[boardIdx]
              if (!board) continue
              const tiles = board.querySelectorAll('.paragon__board__tile')
              const tile = tiles[tileIdx]
              if (!tile) continue
              tile.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }))
              await delay(50)
              const tooltip = document.querySelector('.paragon__tile__tooltip')
              if (!tooltip) {
                tile.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, cancelable: true }))
                await delay(10)
                continue
              }
              const parts: string[] = []
              const nameEl = tooltip.querySelector('.paragon__tile__tooltip__name')
              const tooltipName = nameEl?.textContent?.trim()
              let extractedName: string | null = null
              if (tooltipName) {
                const rarityEl = tooltip.querySelector('.paragon__tile__tooltip__rarity')
                const nameOnly = tooltipName.replace(rarityEl?.textContent || '', '').trim()
                if (nameOnly) extractedName = nameOnly
              }
              tooltip.querySelectorAll('.paragon__tile__tooltip__stat').forEach((stat) => {
                const text = stat.textContent?.trim()
                if (text) parts.push(text)
              })
              const descEl = tooltip.querySelector('.paragon__tile__tooltip__description')
              if (descEl) {
                const text = descEl.textContent?.trim()
                if (text) parts.push(text)
              }
              tooltip
                .querySelectorAll(
                  '.paragon__tile__bonus__requirement, .paragon__tile__bonus__stats'
                )
                .forEach((el) => {
                  const text = el.textContent?.trim()
                  if (text) parts.push(text)
                })
              tile.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, cancelable: true }))
              await delay(10)
              if (parts.length > 0 || extractedName) {
                results.push({
                  boardIdx,
                  tileIdx,
                  name: extractedName,
                  description: parts.length > 0 ? parts.join('\n') : null
                })
              }
            }
            return results
          }, tileIndices)
          .catch(
            () =>
              [] as Array<{
                boardIdx: number
                tileIdx: number
                name: string | null
                description: string | null
              }>
          )

        // Merge hover results back into board nodes
        for (const tip of allTooltipData) {
          const board = boardsData[tip.boardIdx]
          if (!board) continue
          const node = board.allocatedNodes[tip.tileIdx]
          if (!node) continue
          if (tip.name) node.nodeName = tip.name
          if (tip.description) node.nodeDescription = tip.description
        }

        // Save newly scraped boards to cache
        for (const bIdx of uncachedBoardIndices) {
          const boardData = boardsData[bIdx]
          const cacheEntries: CachedNodeData[] = boardData.allocatedNodes.map((n) => ({
            nodeName: n.nodeName,
            nodeType: n.nodeType,
            nodeDescription: n.nodeDescription,
            row: n.row,
            col: n.col,
            iconUrl: n.iconUrl,
            activeIconUrl: n.activeIconUrl,
            bgUrl: n.bgUrl,
            styleTransform: n.styleTransform
          }))
          this.paragonCache?.set(boardData.boardName, cacheEntries)
        }
      }

      // Return cleaned board data (remove internal tileCount)
      return boardsData.map((b) => ({
        boardName: b.boardName,
        boardIndex: b.boardIndex,
        glyph: b.glyph,
        allocatedNodes: b.allocatedNodes,
        boardRotation: b.boardRotation,
        boardBgUrl: b.boardBgUrl,
        boardX: b.boardX,
        boardY: b.boardY
      }))
    } catch {
      return []
    }
  }

  /**
   * Extracts detailed gear data from both the Gear Stats grid
   * and the gear item tooltips in the Gear & Skills tab.
   *
   * Phase A: Scrape the top gear summary for slot/name/type
   * Phase B: Scrape the Gear Stats grid for all affixes
   * Phase C: Hover each gear item to get aspect tooltip data
   */
  private async scrapeGear(page: Page): Promise<IGearSlot[]> {
    await page.waitForSelector('.builder__gear__item', { timeout: 10000 }).catch(() => {})

    try {
      // ── Phase A: Top gear summary (slot, name, rarity, socketed gems) ──
      const topGear = await page.$$eval('.builder__gear__item', (items) => {
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

          // Extract socketed gems from .builder__new__gems container
          const socketedGems: string[] = []
          const gemsContainer = item.querySelector('.builder__new__gems')
          if (gemsContainer) {
            const gemItems = gemsContainer.querySelectorAll('.builder__gems__item')
            gemItems.forEach((gem) => {
              const img = gem.querySelector('img')
              const gemName = img?.getAttribute('alt')?.trim()
              if (gemName) socketedGems.push(gemName)
            })
          }

          return { slot, itemName, itemType, socketedGems }
        })
      })

      // ── Phase B: Gear Stats grid (affixes, tempered, greater, rampage) ──
      const statsData = await page.$$eval('.builder__stats__group', (groups) => {
        return groups.map((group) => {
          const slotEl = group.querySelector('.builder__stats__slot')
          const slot = slotEl?.textContent?.trim() || 'Unknown'

          const affixes: Array<{ name: string; isGreater: boolean }> = []
          const implicitAffixes: Array<{ name: string; isGreater: boolean }> = []
          const temperedAffixes: Array<{ name: string; isGreater: boolean }> = []
          const greaterAffixes: Array<{ name: string; isGreater: boolean }> = []
          let rampageEffect: string | null = null
          let feastEffect: string | null = null

          let isImplicitSection = false
          const rows = group.querySelectorAll('.stat__dropdown__wrapper, .builder__stat')

          rows.forEach((row) => {
            const text = row.textContent?.trim() || ''

            // Check for "Implicit Stat" header
            if (
              row.classList.contains('implicit') ||
              text.toLowerCase() === 'implicit stat'
            ) {
              isImplicitSection = true
              return
            }

            // Skip "Bloodied Affix" label rows
            if (text.toLowerCase() === 'bloodied affix') return

            // Check for Rampage/Feast effects
            if (text.startsWith('Rampage:')) {
              rampageEffect = text
              return
            }
            if (text.startsWith('Feast:')) {
              feastEffect = text
              return
            }

            // Detect affix type
            const isGreater = !!row.querySelector('.greater__affix__button--filled')
            const isTempered = !!row.querySelector('img[src*="tempering"]')

            // Extract the stat text from the dropdown button span
            const statSpan = row.querySelector('.dropdown__button span')
            const statText = statSpan?.textContent?.trim() || text

            if (!statText || statText.toLowerCase() === 'implicit stat') return

            const affix = { name: statText, isGreater }

            if (isTempered) {
              temperedAffixes.push(affix)
            } else if (isGreater) {
              greaterAffixes.push(affix)
              affixes.push(affix)
            } else if (isImplicitSection) {
              implicitAffixes.push(affix)
              isImplicitSection = false
            } else {
              affixes.push(affix)
            }
          })

          return {
            slot,
            affixes,
            implicitAffixes,
            temperedAffixes,
            greaterAffixes,
            rampageEffect,
            feastEffect
          }
        })
      })

      // ── Phase C: Hover gear items for aspect tooltip data ──
      const aspectData = await page
        .evaluate(async () => {
          const delay = (ms: number): Promise<void> =>
            new Promise((resolve) => setTimeout(resolve, ms))
          const results: Array<{
            index: number
            name: string | null
            description: string | null
          }> = []

          const gearItems = document.querySelectorAll('.builder__gear__item')
          for (let i = 0; i < gearItems.length; i++) {
            const item = gearItems[i]
            item.dispatchEvent(
              new MouseEvent('mouseover', { bubbles: true, cancelable: true })
            )
            await delay(150)

            const tooltip = document.querySelector('.codex__tooltip')
            if (tooltip) {
              const nameEl = tooltip.querySelector('.codex__tooltip__name')
              const descEl = tooltip.querySelector('.codex__tooltip__description')
              results.push({
                index: i,
                name: nameEl?.textContent?.trim() || null,
                description: descEl?.textContent?.trim() || null
              })
            }

            item.dispatchEvent(
              new MouseEvent('mouseout', { bubbles: true, cancelable: true })
            )
            await delay(50)
          }
          return results
        })
        .catch(
          () =>
            [] as Array<{ index: number; name: string | null; description: string | null }>
        )

      // ── Merge all three data sources ──
      return topGear
        // Filter out rune items (they show as "Unknown Slot" in gear items)
        .filter((gear) => gear.slot !== 'Unknown Slot')
        .map((gear, i) => {
        // Match stats data by slot name
        const stats = statsData.find(
          (s) => s.slot.toLowerCase() === gear.slot.toLowerCase()
        ) || {
          affixes: [],
          implicitAffixes: [],
          temperedAffixes: [],
          greaterAffixes: [],
          rampageEffect: null,
          feastEffect: null
        }

        // Match aspect tooltip by index
        const aspect = aspectData.find((a) => a.index === i)

        return {
          slot: gear.slot,
          itemName: gear.itemName,
          itemType: gear.itemType,
          requiredAspect: aspect?.name
            ? { name: aspect.name, description: aspect.description || null }
            : null,
          affixes: stats.affixes,
          implicitAffixes: stats.implicitAffixes,
          temperedAffixes: stats.temperedAffixes,
          greaterAffixes: stats.greaterAffixes,
          masterworkPriority: [],
          rampageEffect: stats.rampageEffect,
          feastEffect: stats.feastEffect,
          socketedGems: gear.socketedGems || []
        }
      })
    } catch {
      return []
    }
  }

  /**
   * Extracts active rune data from the "Active Runes" section on d4builds.
   *
   * The standalone runes are in a `.builder__gems` container that is NOT
   * inside a `.builder__gear__item`. Socketed gems inside gear items are
   * handled separately in `scrapeGear()`.
   *
   * Uses Playwright hover() for reliable tooltip triggering.
   */
  private async scrapeRunes(page: Page): Promise<IRune[]> {
    try {
      // Find standalone rune items (not inside gear items)
      // The "Active Runes" section has a top-level .builder__gems that
      // contains .builder__gems__item elements with rune names
      const runeData = await page.evaluate(() => {
        // Get all .builder__gems containers
        const allGemContainers = document.querySelectorAll('.builder__gems')
        const results: Array<{ name: string; index: number }> = []

        for (const container of allGemContainers) {
          // Skip gem containers that are nested inside gear items
          if (container.closest('.builder__gear__item')) continue

          // This is the standalone Active Runes container
          const items = container.querySelectorAll('.builder__gems__item')
          items.forEach((item, i) => {
            const nameEl = item.querySelector('.builder__gem__slot')
            const name = nameEl?.textContent?.trim()
            if (name) results.push({ name, index: i })
          })
        }
        return results
      })

      if (runeData.length === 0) return []

      // Use Playwright's hover() on each rune element to get tooltip data
      const runes: IRune[] = []
      for (let i = 0; i < runeData.length; i++) {
        try {
          // Build a selector for the i-th standalone rune
          // Target rune items that come AFTER the "Active Runes" label
          const runeEl = page.locator(
            '.builder__gems:not(.builder__gear__item .builder__gems) .builder__gems__item'
          ).nth(i)

          const isVisible = await runeEl.isVisible().catch(() => false)
          if (!isVisible) {
            runes.push({
              name: runeData[i].name,
              runeType: 'Rune',
              effects: []
            })
            continue
          }

          // Hover using Playwright for reliable tooltip triggering
          await runeEl.hover({ force: true })
          await page.waitForTimeout(300)

          // Now extract tooltip data
          const tooltipInfo = await page.evaluate(() => {
            const tooltip = document.querySelector('.gem__tooltip')
            if (!tooltip) return null

            const nameEl = tooltip.querySelector('.gem__tooltip__name')
            const typeEl = tooltip.querySelector('.gem__tooltip__class')
            const effectEls = tooltip.querySelectorAll('.gem__tooltip__effect')

            const effects: string[] = []
            effectEls.forEach((el) => {
              const text = el.textContent?.trim()
              if (text) effects.push(text)
            })

            return {
              name: nameEl?.textContent?.trim() || null,
              runeType: typeEl?.textContent?.trim() || null,
              effects
            }
          })

          runes.push({
            name: tooltipInfo?.name || runeData[i].name,
            runeType: tooltipInfo?.runeType || 'Rune',
            effects: tooltipInfo?.effects || []
          })
        } catch {
          // If hover fails, still add the rune with basic info
          runes.push({
            name: runeData[i].name,
            runeType: 'Rune',
            effects: []
          })
        }
      }

      return runes
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
