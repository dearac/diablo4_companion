import { is } from '@electron-toolkit/utils'
import { ChromiumBootstrap, type BootstrapProgress } from './ChromiumBootstrap'

// ============================================================
// BrowserPath — Resolves the Chromium executable for Playwright
// ============================================================
// In development: returns undefined so Playwright uses its
//   globally-installed browser from %LOCALAPPDATA%/ms-playwright/
// In production: uses ChromiumBootstrap to lazy-download Chromium
//   to the app's data directory on first use.
// ============================================================

/** Singleton bootstrap instance (set once from index.ts) */
let bootstrapInstance: ChromiumBootstrap | null = null

/**
 * Initializes the browser path resolver with the app's data directory.
 * Must be called once during app startup before any imports are attempted.
 */
export function initBrowserPath(userDataDir: string): void {
  bootstrapInstance = new ChromiumBootstrap(userDataDir)
}

/**
 * Returns the path to the Chromium executable for Playwright.
 * Downloads Chromium on first call if not already present.
 *
 * - Development: `undefined` (Playwright auto-discovers from ms-playwright)
 * - Production: lazy-downloaded to `<userData>/chromium/`
 *
 * @param onProgress - Optional callback for download progress updates
 * @returns Path to chrome.exe, or undefined in dev mode
 */
export async function getBrowserPath(
  onProgress?: (progress: BootstrapProgress) => void
): Promise<string | undefined> {
  if (is.dev) return undefined
  if (!bootstrapInstance) {
    throw new Error('BrowserPath not initialized — call initBrowserPath() first')
  }
  return bootstrapInstance.ensureBrowser(onProgress)
}

/**
 * Checks whether Chromium is already downloaded (synchronous).
 * Useful for UI to decide whether to show a download prompt.
 */
export function isBrowserDownloaded(): boolean {
  if (is.dev) return true
  return bootstrapInstance?.isDownloaded ?? false
}
