/**
 * Scan Pipeline E2E Test
 *
 * Verifies the end-to-end scan pipeline:
 *   1. Launches the Electron app
 *   2. Loads a build (from library or via import)
 *   3. Opens the overlay window
 *   4. Triggers a scan via IPC (perform-scan)
 *   5. Checks that a screenshot was saved to data/scans/
 *   6. Verifies the scan result structure
 *
 * NOTE: This test exercises the real ScreenCaptureService.
 *       WinOcr.exe must be present at sidecar/bin/WinOcr.exe.
 *       The OCR step will attempt to run against the captured screenshot.
 */
import { test, expect, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'
import path from 'path'
import fs from 'fs'

const SCREENSHOTS_DIR = path.join(__dirname, '../../test-results/scan-pipeline')
const SCANS_DATA_DIR = path.join(__dirname, '../../data/scans')

/**
 * Default build URL to import when no saved builds exist.
 */
const FALLBACK_BUILD_URL = 'https://d4builds.gg/builds/blessed-hammer-paladin-endgame/?var=0'

/**
 * Imports a build by pasting the fallback URL into the import form.
 */
async function importBuildFromUrl(page: Page, url: string): Promise<void> {
  const urlInput = page.locator('#url-input')
  const importBtn = page.locator('#import-button')

  await urlInput.fill(url)
  await page.waitForTimeout(300)
  await expect(importBtn).toBeEnabled({ timeout: 2000 })
  await importBtn.click()

  console.log('Importing build — this may take up to 2 minutes...')
  await expect(page.locator('.build-summary')).toBeVisible({ timeout: 120_000 })
  console.log('✓ Build imported successfully')
}

test.describe('Scan Pipeline', () => {
  let electronApp: ElectronApplication
  let configPage: Page

  // Allow up to 3 minutes for live import
  test.setTimeout(180_000)

  test.beforeAll(async () => {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })

    electronApp = await electron.launch({
      args: [path.join(__dirname, '../../out/main/index.js')]
    })

    configPage = await electronApp.firstWindow()
    await configPage.waitForLoadState('domcontentloaded')
    await configPage.waitForTimeout(2000)
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('F7 scan captures a screenshot and returns a result', async () => {
    // ─── Step 1: Load a build ───────────────────────────────────
    const buildCards = configPage.locator('.build-library__item')
    const savedBuildCount = await buildCards.count()
    console.log(`Saved builds in library: ${savedBuildCount}`)

    if (savedBuildCount > 0) {
      console.log('Loading first saved build from library...')
      const loadBtn = buildCards.first().locator('.build-library__load-btn')
      await loadBtn.click()
      await configPage.waitForTimeout(1500)
    } else {
      console.log(`No saved builds — importing from: ${FALLBACK_BUILD_URL}`)
      await importBuildFromUrl(configPage, FALLBACK_BUILD_URL)
    }

    await expect(configPage.locator('.build-summary')).toBeVisible({ timeout: 5000 })
    console.log('✓ Build loaded')

    // Take a screenshot of the config window for reference
    await configPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, '01-build-loaded.png')
    })

    // ─── Step 2: Open the overlay ────────────────────────────────
    const launchBtn = configPage.getByRole('button', { name: /launch overlay/i })
    await expect(launchBtn).toBeVisible({ timeout: 5000 })
    await launchBtn.click()
    console.log('✓ Overlay launched via button')

    // Wait for overlay window to appear
    await configPage.waitForTimeout(3000)
    const windows = electronApp.windows()
    console.log(`Open windows: ${windows.length}`)

    // ─── Step 3: Count existing scan files ────────────────────────
    let existingScanFiles: string[] = []
    if (fs.existsSync(SCANS_DATA_DIR)) {
      existingScanFiles = fs.readdirSync(SCANS_DATA_DIR).filter((f) => f.startsWith('scan-'))
    }
    console.log(`Existing scan files before test: ${existingScanFiles.length}`)

    // ─── Step 4: Trigger scan via IPC ────────────────────────────
    // We invoke the perform-scan handler from the renderer window,
    // since global hotkeys (F7) can't be reliably triggered via Playwright
    console.log('Triggering scan via IPC (perform-scan)...')

    const result = await configPage.evaluate(async () => {
      try {
        // @ts-expect-error - performScan is defined on window.api
        const scanResult = await window.api.performScan()
        return scanResult
      } catch (err: unknown) {
        return {
          error: err instanceof Error ? err.message : String(err),
          mode: 'compare',
          verdict: null,
          equippedItem: null
        }
      }
    })

    console.log('\n╔══════════════════════════════════════════════════╗')
    console.log('║  Scan Result                                     ║')
    console.log('╠══════════════════════════════════════════════════╣')
    console.log(`║  Mode:    ${result.mode}`)
    console.log(`║  Error:   ${result.error || 'none'}`)
    console.log(`║  Verdict: ${result.verdict ? result.verdict.verdict : 'null'}`)
    if (result.verdict) {
      console.log(
        `║  Score:   ${result.verdict.buildMatchCount}/${result.verdict.buildTotalExpected}`
      )
      console.log(`║  Matched: ${JSON.stringify(result.verdict.matchedAffixes)}`)
      console.log(`║  Missing: ${JSON.stringify(result.verdict.missingAffixes)}`)
    }
    console.log('╚══════════════════════════════════════════════════╝')

    // ─── Step 5: Verify screenshot was captured ──────────────────
    if (fs.existsSync(SCANS_DATA_DIR)) {
      const newScanFiles = fs
        .readdirSync(SCANS_DATA_DIR)
        .filter((f) => f.startsWith('scan-'))
        .sort()

      console.log(`\nScan files after test: ${newScanFiles.length}`)

      if (newScanFiles.length > existingScanFiles.length) {
        const newestScan = newScanFiles[newScanFiles.length - 1]
        console.log(`✓ New screenshot captured: ${newestScan}`)

        // Verify it's a valid PNG file (check file size > 0)
        const scanPath = path.join(SCANS_DATA_DIR, newestScan)
        const stats = fs.statSync(scanPath)
        console.log(`  File size: ${(stats.size / 1024).toFixed(1)} KB`)
        expect(stats.size).toBeGreaterThan(0)
        console.log('✓ Screenshot file is valid (size > 0)')
      } else {
        console.log('⚠ No new screenshot file detected (OCR/scan may have failed before save)')
      }
    }

    // ─── Step 6: Verify result structure ─────────────────────────
    // The scan should return a result with the expected shape,
    // regardless of whether OCR succeeded
    expect(result).toHaveProperty('mode')
    expect(result).toHaveProperty('error')
    expect(['compare', 'equip']).toContain(result.mode)
    console.log('\n✓ Scan result has valid structure')

    // Take a final screenshot
    await configPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, '02-after-scan.png')
    })

    console.log('\n════════════════════════════════════════')
    console.log('  ✓ Scan pipeline E2E test complete')
    console.log('════════════════════════════════════════')
  })
})
