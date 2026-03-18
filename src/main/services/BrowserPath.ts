import { join } from 'path'
import { is } from '@electron-toolkit/utils'

// ============================================================
// BrowserPath — Resolves the Chromium executable for Playwright
// ============================================================
// In development: returns undefined so Playwright uses its
//   globally-installed browser from %LOCALAPPDATA%/ms-playwright/
// In production: returns the path to the bundled Chromium that
//   was copied into extraResources during the build process.
// ============================================================

/**
 * Returns the path to the Chromium executable for Playwright.
 *
 * - Development: `undefined` (Playwright auto-discovers from ms-playwright)
 * - Production: `<resources>/chromium/chrome.exe` (bundled via extraResources)
 */
export function getBrowserPath(): string | undefined {
  if (is.dev) return undefined
  return join(process.resourcesPath, 'chromium', 'chrome.exe')
}
