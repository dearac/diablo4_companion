import { chromium } from 'playwright'
import { BuildScraper, RawBuildData } from './BuildScraper'
import { BuildSourceSite, D4Class } from '../../shared/types'

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

      // TODO: Implement Skill and Paragon tab switching and scraping
      // This requires clicking specific tab buttons and waiting for the tree to render.

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
      throw new Error(`Failed to scrape Maxroll build: ${message}`)
    } finally {
      await browser.close()
    }
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
