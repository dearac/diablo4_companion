import type { BuildSourceSite } from '../../shared/types'
import type { BuildScraper, RawBuildData } from '../scrapers/BuildScraper'

// ============================================================
// BuildImportService — The orchestrator for build imports
// ============================================================
// When a user pastes a build URL, this service figures out which
// website it's from (URL routing), hands it to the correct scraper,
// and returns the normalized build data.
//
// Think of it like a mail sorter: it looks at the "address" (URL)
// and sends the "letter" (scrape request) to the right "department"
// (site scraper).
// ============================================================

/**
 * Manages the build import process.
 *
 * Holds a list of all available scrapers and routes incoming URLs
 * to the correct one.
 */
export class BuildImportService {
  /** All registered site scrapers */
  private scrapers: BuildScraper[] = []

  /**
   * Registers a scraper for a specific site.
   * Called during app initialization to set up all supported sites.
   */
  registerScraper(scraper: BuildScraper): void {
    this.scrapers.push(scraper)
  }

  /**
   * URL Routing: Figures out which build website the URL belongs to.
   *
   * Checks the URL against each registered scraper's canHandle() method.
   * If none match, throws an error telling the user which sites are supported.
   *
   * @param url - The build URL the user pasted
   * @returns The source site key ('maxroll', 'd4builds', or 'icy-veins')
   * @throws Error if the URL doesn't match any supported site
   */
  detectSite(url: string): BuildSourceSite {
    // Normalize to lowercase for consistent matching
    const normalized = url.toLowerCase().trim()

    // Check URL patterns directly (fast path that works even without scrapers)
    if (normalized.includes('d4builds.gg')) return 'd4builds'
    if (normalized.includes('maxroll.gg')) return 'maxroll'
    if (normalized.includes('icy-veins.com')) return 'icy-veins'

    // If direct pattern didn't match, try each scraper's canHandle
    for (const scraper of this.scrapers) {
      if (scraper.canHandle(url)) return scraper.sourceKey
    }

    // No scraper found — tell the user what we support
    throw new Error(
      `Unsupported build URL: "${url}"\n` +
        `Supported sites: d4builds.gg, maxroll.gg, icy-veins.com`
    )
  }

  /**
   * Finds the scraper that can handle the given URL.
   *
   * @param url - The build URL
   * @returns The matching scraper, or null if none found
   */
  private findScraper(url: string): BuildScraper | null {
    for (const scraper of this.scrapers) {
      if (scraper.canHandle(url)) return scraper
    }
    return null
  }

  /**
   * Imports a build from a URL.
   *
   * This is the main entry point for the import flow:
   * 1. Detect which site the URL is from
   * 2. Find the right scraper
   * 3. Scrape the build data
   * 4. Return the raw data for normalization
   *
   * @param url - The build URL to import
   * @returns The raw build data from the site
   * @throws Error if the URL isn't from a supported site or scraping fails
   */
  async importFromUrl(url: string): Promise<RawBuildData> {
    const scraper = this.findScraper(url)

    if (!scraper) {
      throw new Error(
        `No scraper available for "${url}". ` +
          `Make sure the URL is from d4builds.gg, maxroll.gg, or icy-veins.com.`
      )
    }

    // Let the scraper do its thing — this launches Playwright,
    // navigates to the URL, and extracts all the build data
    return scraper.scrape(url)
  }
}
