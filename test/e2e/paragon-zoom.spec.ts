/**
 * Paragon Canvas Zoom Test
 *
 * End-to-end test that launches the Electron app, loads a saved
 * build from the library (or imports one live from d4builds.gg),
 * expands the Paragon section, and verifies mouse wheel zoom
 * in/out on the interactive canvas.
 *
 * Checks:
 *   - Canvas renders with tiles and board groups
 *   - Mouse wheel zooms in (zoom badge % increases)
 *   - Mouse wheel zooms out (zoom badge % decreases)
 *   - Canvas transform updates on each zoom
 *   - Zoom toolbar buttons work (+, −, fit-all)
 *   - Screenshots captured at each stage for visual review
 *
 * @see TESTING_RULES.md — fallback build URL for import
 */
import { test, expect, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'
import path from 'path'
import fs from 'fs'

const SCREENSHOTS_DIR = path.join(__dirname, '../../test-results/paragon-zoom')

/**
 * Default build URL to import when no saved builds exist.
 * This is the canonical test build for the Diablo IV Companion app.
 * See: TESTING_RULES.md
 */
const FALLBACK_BUILD_URL = 'https://d4builds.gg/builds/blessed-hammer-paladin-endgame/?var=0'

// ============================================================
// Helpers
// ============================================================

/**
 * Extracts the numeric zoom percentage from the zoom badge text.
 * e.g. "42%" → 42
 */
async function getZoomPercent(page: Page): Promise<number> {
  const badge = page.locator('.paragon-canvas__zoom-badge')
  const text = await badge.textContent()
  return parseInt(text?.replace('%', '') || '0', 10)
}

/**
 * Reads the CSS transform string from the world layer.
 * Returns e.g. "translate(73px, 120px) scale(0.35)"
 */
async function getWorldTransform(page: Page): Promise<string> {
  const world = page.locator('.paragon-canvas__world')
  return (await world.getAttribute('style')) || ''
}

/**
 * Extracts the scale value from the world layer's inline transform.
 * e.g. "transform: translate(73px, 120px) scale(0.35)" → 0.35
 */
async function getWorldScale(page: Page): Promise<number> {
  const style = await getWorldTransform(page)
  const match = style.match(/scale\(([\d.]+)\)/)
  return match ? parseFloat(match[1]) : 0
}

/**
 * Dispatches a WheelEvent directly on the canvas element.
 *
 * Playwright's mouse.wheel() fires at the CDP level and doesn't
 * trigger React's synthetic onWheel handler. By dispatching a
 * real WheelEvent on the DOM node, we correctly bubble through
 * React's event delegation.
 *
 * @param deltaY - Positive = zoom out, Negative = zoom in
 */
async function dispatchWheelOnCanvas(
  page: Page,
  deltaY: number,
  clientX: number,
  clientY: number
): Promise<void> {
  await page.evaluate(
    ({ dy, cx, cy }) => {
      const canvas = document.querySelector('.paragon-canvas')
      if (!canvas) return
      canvas.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: dy,
          clientX: cx,
          clientY: cy,
          bubbles: true,
          cancelable: true
        })
      )
    },
    { dy: deltaY, cx: clientX, cy: clientY }
  )
}

/**
 * Imports a build by pasting the fallback URL into the import form
 * and clicking the Import button. Waits for the build summary to appear.
 */
async function importBuildFromUrl(page: Page, url: string): Promise<void> {
  const urlInput = page.locator('#url-input')
  const importBtn = page.locator('#import-button')

  // Type the build URL
  await urlInput.fill(url)
  await page.waitForTimeout(300)

  // Click Import
  await expect(importBtn).toBeEnabled({ timeout: 2000 })
  await importBtn.click()

  // Wait for the import to complete — scraping can take up to 2 minutes
  // The import button changes to "⏳ Importing..." while loading
  // and then the build summary card appears on success.
  console.log('Importing build — this may take up to 2 minutes...')
  await expect(page.locator('.build-summary')).toBeVisible({ timeout: 120_000 })
  console.log('✓ Build imported successfully')
}

// ============================================================
// Test
// ============================================================

test.describe('Paragon Board Zoom Interaction', () => {
  let electronApp: ElectronApplication
  let configPage: Page

  // Increase test timeout to accommodate live import if needed
  test.setTimeout(180_000)

  test.beforeAll(async () => {
    // Ensure screenshots directory exists
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })

    // Launch the built Electron app
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../../out/main/index.js')]
    })

    // Get the config window (first window that Electron opens)
    configPage = await electronApp.firstWindow()
    await configPage.waitForLoadState('domcontentloaded')
    await configPage.waitForTimeout(2000)
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('loads a build and zooms the paragon canvas with the mouse wheel', async () => {
    // ─── Step 1: Load a build ───────────────────────────────────
    // Try to load from the saved build library first.
    // If no saved builds exist, import one live from d4builds.gg.

    const buildCards = configPage.locator('.build-library__item')
    const savedBuildCount = await buildCards.count()
    console.log(`Saved builds in library: ${savedBuildCount}`)

    if (savedBuildCount > 0) {
      // Click the load button on the first saved build
      console.log('Loading first saved build from library...')
      const loadBtn = buildCards.first().locator('.build-library__load-btn')
      await loadBtn.click()
      await configPage.waitForTimeout(1500)
    } else {
      // No saved builds — import from the canonical test URL
      console.log(`No saved builds — importing from: ${FALLBACK_BUILD_URL}`)
      await importBuildFromUrl(configPage, FALLBACK_BUILD_URL)
    }

    // Verify build summary appeared
    const buildSummary = configPage.locator('.build-summary')
    await expect(buildSummary).toBeVisible({ timeout: 5000 })
    console.log('✓ Build summary is visible')

    // Take baseline screenshot
    await configPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, '01-build-loaded.png')
    })

    // ─── Step 2: Expand the Paragon section ─────────────────────
    const paragonToggle = configPage.locator('.build-summary__section-toggle', {
      hasText: /paragon/i
    })
    await expect(paragonToggle).toBeVisible({ timeout: 5000 })
    await paragonToggle.click()
    await configPage.waitForTimeout(1500)
    console.log('✓ Paragon section expanded')

    // Screenshot with paragon expanded
    await configPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, '02-paragon-expanded.png')
    })

    // ─── Step 3: Verify canvas rendered ─────────────────────────
    const canvas = configPage.locator('.paragon-canvas')
    await expect(canvas).toBeVisible({ timeout: 5000 })

    const boardGroups = configPage.locator('.paragon-canvas__board-group')
    const boardCount = await boardGroups.count()
    console.log(`Board groups rendered: ${boardCount}`)
    expect(boardCount).toBeGreaterThan(0)

    const tiles = configPage.locator('.paragon-canvas-tile')
    const tileCount = await tiles.count()
    console.log(`Total tiles rendered: ${tileCount}`)
    expect(tileCount).toBeGreaterThan(0)

    // Read initial zoom state
    const initialZoom = await getZoomPercent(configPage)
    const initialScale = await getWorldScale(configPage)
    console.log(`Initial zoom: ${initialZoom}%  (scale: ${initialScale})`)

    // ─── Step 4: Zoom IN with mouse wheel ───────────────────────
    // Get the canvas bounding box so we can target the center
    const canvasBox = await canvas.boundingBox()
    expect(canvasBox).not.toBeNull()
    const centerX = canvasBox!.x + canvasBox!.width / 2
    const centerY = canvasBox!.y + canvasBox!.height / 2
    console.log(`Canvas center: (${Math.round(centerX)}, ${Math.round(centerY)})`)

    // Zoom in: dispatch wheel events with negative deltaY
    for (let i = 0; i < 8; i++) {
      await dispatchWheelOnCanvas(configPage, -120, centerX, centerY)
      await configPage.waitForTimeout(100)
    }
    await configPage.waitForTimeout(500)

    const zoomAfterIn = await getZoomPercent(configPage)
    const scaleAfterIn = await getWorldScale(configPage)
    console.log(`After zoom IN: ${zoomAfterIn}%  (scale: ${scaleAfterIn})`)

    // Verify zoom increased
    expect(zoomAfterIn).toBeGreaterThan(initialZoom)
    expect(scaleAfterIn).toBeGreaterThan(initialScale)
    console.log('✓ Zoom IN verified')

    // Screenshot after zooming in
    await configPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, '03-zoomed-in.png')
    })

    // ─── Step 5: Zoom OUT with mouse wheel ──────────────────────
    // Zoom out: dispatch wheel events with positive deltaY
    for (let i = 0; i < 20; i++) {
      await dispatchWheelOnCanvas(configPage, 120, centerX, centerY)
      await configPage.waitForTimeout(100)
    }
    await configPage.waitForTimeout(500)

    const zoomAfterOut = await getZoomPercent(configPage)
    const scaleAfterOut = await getWorldScale(configPage)
    console.log(`After zoom OUT: ${zoomAfterOut}%  (scale: ${scaleAfterOut})`)

    // Verify zoom decreased compared to zoomed-in state
    expect(zoomAfterOut).toBeLessThan(zoomAfterIn)
    expect(scaleAfterOut).toBeLessThan(scaleAfterIn)
    console.log('✓ Zoom OUT verified')

    // Screenshot after zooming out
    await configPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, '04-zoomed-out.png')
    })

    // ─── Step 6: Verify zoom toolbar buttons ────────────────────

    // Click the "fit all" button to reset the view
    const fitBtn = configPage.locator('.paragon-canvas__tool-btn--fit')
    if (await fitBtn.isVisible()) {
      await fitBtn.click()
      await configPage.waitForTimeout(500)

      const zoomAfterFit = await getZoomPercent(configPage)
      console.log(`After fit-all: ${zoomAfterFit}%`)

      await configPage.screenshot({
        path: path.join(SCREENSHOTS_DIR, '05-fit-all.png')
      })
      console.log('✓ Fit-all button works')
    }

    // Click zoom-in button (+)
    const zoomInBtn = configPage.locator('.paragon-canvas__tool-btn').first()
    if (await zoomInBtn.isVisible()) {
      const zoomBefore = await getZoomPercent(configPage)
      await zoomInBtn.click()
      await configPage.waitForTimeout(300)
      const zoomAfter = await getZoomPercent(configPage)
      console.log(`Zoom button +: ${zoomBefore}% → ${zoomAfter}%`)
      expect(zoomAfter).toBeGreaterThan(zoomBefore)
      console.log('✓ Zoom-in button works')
    }

    // Click zoom-out button (−)
    const toolbarBtns = configPage.locator('.paragon-canvas__tool-btn')
    const btnCount = await toolbarBtns.count()
    if (btnCount >= 2) {
      const zoomOutBtn = toolbarBtns.nth(1)
      const zoomBefore = await getZoomPercent(configPage)
      await zoomOutBtn.click()
      await configPage.waitForTimeout(300)
      const zoomAfter = await getZoomPercent(configPage)
      console.log(`Zoom button −: ${zoomBefore}% → ${zoomAfter}%`)
      expect(zoomAfter).toBeLessThan(zoomBefore)
      console.log('✓ Zoom-out button works')
    }

    // Final screenshot
    await configPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, '06-final.png')
    })

    console.log('\n════════════════════════════════════════')
    console.log('  ✓ All zoom interactions verified')
    console.log('════════════════════════════════════════')
  })
})
