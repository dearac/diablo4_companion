import type { BuildSourceSite } from '../../shared/types'
import type { RawBuildData, ImportProgressCallback } from '../scrapers/BuildScraper'
import { D4BuildsScraper } from '../scrapers/D4BuildsScraper'

/** The singleton scraper instance (lazy-initialized) */
let scraper: D4BuildsScraper | null = null

/** Initializes the scraper with a cache directory. Must be called at startup. */
export function initBuildImport(cacheDir?: string): void {
  scraper = new D4BuildsScraper(cacheDir)
}

/** Clears the paragon cache (call after game patches). */
export function clearParagonCache(): void {
  scraper?.clearCache()
}

/**
 * Detects which site a URL belongs to.
 * @throws Error if URL isn't from a supported site
 */
export function detectSite(url: string): BuildSourceSite {
  const normalized = url.toLowerCase().trim()
  if (normalized.includes('d4builds.gg')) return 'd4builds'
  throw new Error(`Unsupported build URL: "${url}"\nSupported sites: d4builds.gg`)
}

/**
 * Imports a build from a URL.
 * @throws Error if URL isn't supported or scraping fails
 */
export async function importBuild(
  url: string,
  onProgress?: ImportProgressCallback
): Promise<RawBuildData> {
  if (!scraper) throw new Error('Build import not initialized — call initBuildImport() first')
  
  const normalized = url.toLowerCase().trim()
  if (!normalized.includes('d4builds.gg')) {
    throw new Error(`No scraper available for "${url}". Supported sites: d4builds.gg`)
  }
  
  return scraper.scrape(url, onProgress)
}
