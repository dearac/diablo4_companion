import { chromium, Page } from 'playwright'
import { BuildScraper, RawBuildData } from './BuildScraper'
import { BuildSourceSite, D4Class, ISkillAllocation } from '../../shared/types'

// ============================================================
// D4BuildsScraper — Scraper for d4builds.gg build planner
// ============================================================
// D4Builds renders a builder page with separate sections for
// skills, paragon, and gear. The skill section uses elements
// with class `.builder__skill` and marks allocated ones with
// `.builder__skill--active`. Each node contains the skill name,
// point allocation (as "X/Y"), and a type indicator.
// ============================================================

/**
 * Scraper for d4builds.gg builds.
 * Uses Playwright to extract data from the D4Builds planner.
 */
export class D4BuildsScraper extends BuildScraper {
  readonly siteName = 'd4builds.gg'
  readonly sourceKey: BuildSourceSite = 'd4builds'

  /**
   * Checks if this scraper can handle the given URL.
   * Matches d4builds.gg/builds/ URLs.
   */
  canHandle(url: string): boolean {
    const normalized = url.toLowerCase().trim()
    return normalized.includes('d4builds.gg/builds/')
  }

  /**
   * Scrapes the build data from the given URL.
   *
   * @param url - The D4Builds build URL
   */
  async scrape(url: string): Promise<RawBuildData> {
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    })
    const page = await context.newPage()

    try {
      // 1. Navigate to the build page
      await page.goto(url, { waitUntil: 'networkidle' })

      // 2. Wait for the header description to appear
      await page.waitForSelector('.builder__header__description', { timeout: 30000 })

      // 3. Extract Metadata
      const buildName = await page.$eval(
        '.builder__header__description',
        (el) => el.textContent?.trim() || 'Unknown Build'
      )

      const d4ClassRaw = await page.$eval(
        '.builder__header__title',
        (el) => el.textContent?.trim() || 'Barbarian'
      )

      const d4Class = this.normalizeClass(d4ClassRaw)

      // 4. Extract Skills
      const skills = await this.scrapeSkills(page)

      return {
        name: buildName,
        d4Class: d4Class,
        level: 100,
        skills,
        paragonBoards: [],
        gearSlots: []
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
   * Extracts all allocated skill nodes from the D4Builds skill section.
   *
   * D4Builds marks allocated skills with `.builder__skill--active`.
   * Each active node contains:
   * - `.builder__skill__name` — the skill's display name
   * - `.builder__skill__points` — "X/Y" format (e.g., "5/5")
   * - `.builder__skill__type` — "active", "passive", or "keystone"
   *
   * @param page - The Playwright page, already on the build page
   * @returns Array of skill allocations found in the tree
   */
  private async scrapeSkills(page: Page): Promise<ISkillAllocation[]> {
    // Click the Skills section tab if it exists
    const skillsTab = await page.$(
      '.builder__tab--skills, [data-tab="skills"], button:has-text("Skills")'
    )
    if (skillsTab) {
      await skillsTab.click()
      // Wait briefly for the skill section to render
      await page.waitForSelector('.builder__skill', { timeout: 10000 }).catch(() => {
        // Skills section may already be visible
      })
    }

    // Extract all allocated skill nodes
    const skills = await page.$$eval(
      '.builder__skill--active, .builder__skill[class*="active"]',
      (nodes) => {
        return nodes.map((node) => {
          // Extract skill name from the dedicated name element
          const nameEl = node.querySelector('.builder__skill__name')
          const skillName = nameEl?.textContent?.trim() || 'Unknown Skill'

          // Parse point allocation from "X/Y" format
          const pointsEl = node.querySelector('.builder__skill__points')
          const pointsText = pointsEl?.textContent?.trim() || ''
          const pointsMatch = pointsText.match(/(\d+)\s*\/\s*(\d+)/)

          const points = pointsMatch ? parseInt(pointsMatch[1], 10) : 1
          const maxPoints = pointsMatch ? parseInt(pointsMatch[2], 10) : 1

          // Determine node type from the type indicator element
          const typeEl = node.querySelector('.builder__skill__type')
          const typeText = typeEl?.textContent?.trim()?.toLowerCase() || ''

          let nodeType: 'active' | 'passive' | 'keystone' = 'active'
          if (typeText.includes('passive')) {
            nodeType = 'passive'
          } else if (typeText.includes('keystone')) {
            nodeType = 'keystone'
          }

          return {
            skillName,
            points,
            maxPoints,
            tier: 'core', // D4Builds doesn't expose tier in the DOM
            nodeType
          }
        })
      }
    )

    return skills
  }

  /**
   * Normalizes the class name from D4Builds' header title.
   * Titles are often like "Whirlwind Barbarian Build Guide".
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
