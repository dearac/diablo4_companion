import type { BuildSourceSite } from '../../shared/types'

// ============================================================
// BuildScraper — The base class for all site scrapers
// ============================================================
// Each build website (maxroll, d4builds, icy-veins) has its own
// scraper that knows how to read that site's DOM and extract the
// build data. This base class defines the interface that every
// scraper must follow.
//
// To add a new site: create a new class that extends this one,
// implement canHandle() and scrape(), and add it to the
// BuildImportService. No other code needs to change.
// ============================================================

/**
 * Raw data scraped from a build website before normalization.
 * Each scraper fills this in differently, but the structure is the same.
 */
export interface RawBuildData {
  name: string
  d4Class: string
  level: number
  skills: any[]
  paragonBoards: any[]
  gearSlots: any[]
}

/**
 * Abstract base class for all build scrapers.
 *
 * Every website scraper inherits from this class and implements:
 * - canHandle(url): Can this scraper handle the given URL?
 * - scrape(url): Navigate to the URL and extract build data
 */
export abstract class BuildScraper {
  /** The display name of the site (e.g., "maxroll.gg") */
  abstract readonly siteName: string

  /** The internal source key used in our data model */
  abstract readonly sourceKey: BuildSourceSite

  /**
   * Checks whether this scraper can handle the given URL.
   * Each scraper knows what URLs belong to its site.
   *
   * @param url - The build URL the user pasted
   * @returns true if this scraper knows how to read this URL
   */
  abstract canHandle(url: string): boolean

  /**
   * Navigates to the URL and extracts all build data.
   * Uses Playwright to load the page and read the DOM.
   *
   * @param url - The build URL to scrape
   * @returns The raw build data from the page
   */
  abstract scrape(url: string): Promise<RawBuildData>
}
