import { chromium } from 'playwright'
import { BuildScraper } from './BuildScraper'
import { BuildSourceSite, D4Class, RawBuildData } from '../../shared/types'

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

      // TODO: Implement Skill and Paragon scraping

      return {
        name: buildName,
        d4Class: d4Class,
        level: 100,
        skills: [],
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
