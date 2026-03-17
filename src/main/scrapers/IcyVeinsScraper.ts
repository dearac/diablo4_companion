import { chromium } from 'playwright'
import { BuildScraper, RawBuildData } from './BuildScraper'
import { BuildSourceSite, D4Class } from '../../shared/types'

// ============================================================
// IcyVeinsScraper — Scraper for icy-veins.com D4 build guides
// ============================================================
// Icy Veins publishes editorial build guides at URLs like:
//   https://www.icy-veins.com/d4/rogue-build-guide
//
// Their page structure uses semantic HTML with clear headings
// and structured sections. This scraper extracts the metadata
// (build name and class) from the page header.
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
   * Scrapes the build metadata from the given URL.
   * Currently extracts only name and class (metadata-only phase).
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
      await page.goto(url, { waitUntil: 'networkidle' })

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

      // TODO: Implement Skill and Paragon scraping in future tasks

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
      throw new Error(`Failed to scrape Icy Veins build: ${message}`)
    } finally {
      await browser.close()
    }
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
