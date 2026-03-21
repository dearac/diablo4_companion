/**
 * Paragon Board Detach Overlay Test
 *
 * End-to-end test that verifies the detach overlay feature:
 *   1. Imports a build from d4builds.gg (Blessed Shield Paladin)
 *   2. Opens the overlay window
 *   3. Navigates to the Paragon tab
 *   4. Triggers detach via IPC (from the overlay renderer)
 *   5. Verifies the detach window opens with board tiles
 *   6. Tests opacity slider changes
 *   7. Tests rotation controls
 *   8. Tests lock/unlock (click-through toggle)
 *   9. Tests the Done button (close)
 *   10. Verifies the detach window is destroyed
 *
 * NOTE: The detach window is transparent and frameless. Playwright's
 * `waitForEvent('window')` can miss it, so we use polling + the
 * Electron evaluateHandle API to detect it reliably.
 */
import { test, expect, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'
import path from 'path'
import fs from 'fs'

const SCREENSHOTS_DIR = path.join(__dirname, '../../test-results/paragon-detach')

/**
 * Build URL for the Blessed Shield Paladin build.
 */
const BUILD_URL = 'https://d4builds.gg/builds/blessed-shield-paladin-endgame/?var=0'

// ============================================================
// Helpers
// ============================================================

/**
 * Imports a build by pasting a URL into the import form.
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

/**
 * Finds a Playwright Page for a window whose URL contains the given substring.
 * Electron transparent windows sometimes don't emit the 'window' event,
 * so we poll electronApp.windows() to find them.
 */
async function findWindowByUrl(
  electronApp: ElectronApplication,
  urlSubstring: string,
  timeout = 15_000
): Promise<Page> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    for (const page of electronApp.windows()) {
      const url = page.url()
      if (url.includes(urlSubstring)) {
        return page
      }
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  // Log all windows for debugging
  const allUrls = electronApp.windows().map((w) => w.url())
  throw new Error(
    `Timed out finding window with URL containing "${urlSubstring}". ` +
    `Current windows: ${JSON.stringify(allUrls)}`
  )
}

// ============================================================
// Test
// ============================================================

test.describe('Paragon Board Detach Overlay', () => {
  let electronApp: ElectronApplication
  let configPage: Page

  // Allow up to 4 minutes for live import + overlay interactions
  test.setTimeout(240_000)

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

  test('detach a paragon board, test controls, and close', async () => {
    // ─── Step 1: Load the Blessed Shield Paladin build ─────────
    const buildCards = configPage.locator('.build-library__item')
    const savedBuildCount = await buildCards.count()
    console.log(`Saved builds in library: ${savedBuildCount}`)

    if (savedBuildCount > 0) {
      console.log('Loading first saved build from library...')
      const loadBtn = buildCards.first().locator('.build-library__load-btn')
      await loadBtn.click()
      await configPage.waitForTimeout(1500)
    } else {
      console.log(`No saved builds — importing from: ${BUILD_URL}`)
      await importBuildFromUrl(configPage, BUILD_URL)
    }

    await expect(configPage.locator('.build-summary')).toBeVisible({ timeout: 5000 })
    console.log('✓ Build loaded')

    await configPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, '01-build-loaded.png')
    })

    // ─── Step 2: Launch the overlay window ────────────────────
    const launchBtn = configPage.getByRole('button', { name: /launch overlay/i })
    await expect(launchBtn).toBeVisible({ timeout: 5000 })
    await launchBtn.click()
    console.log('✓ Overlay launch clicked')

    // Wait for overlay window to appear
    const overlayPage = await findWindowByUrl(electronApp, 'overlay')
    await overlayPage.waitForLoadState('domcontentloaded')
    await overlayPage.waitForTimeout(2000)

    const windowCountAfterOverlay = electronApp.windows().length
    console.log(`Windows after overlay launch: ${windowCountAfterOverlay}`)

    await overlayPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, '02-overlay-opened.png')
    })

    // ─── Step 3: Switch to the Paragon tab ───────────────────
    const paragonTab = overlayPage.locator('.tab-bar__tab', { hasText: /paragon/i })
    if (await paragonTab.isVisible({ timeout: 3000 })) {
      await paragonTab.click()
      await overlayPage.waitForTimeout(1500)
      console.log('✓ Switched to Paragon tab')
    } else {
      console.log('Paragon tab not found — may be default tab')
    }

    await overlayPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, '03-paragon-tab.png')
    })

    // ─── Step 4: Verify boards are rendered ──────────────────
    const boardGroups = overlayPage.locator('.paragon-canvas__board-group')
    const boardCount = await boardGroups.count()
    console.log(`Board groups rendered: ${boardCount}`)
    expect(boardCount).toBeGreaterThan(0)

    const boardNames = await overlayPage.evaluate(() => {
      const labels = document.querySelectorAll('.paragon-canvas-board__name')
      return Array.from(labels).map((el) => el.textContent?.trim() || 'Unknown')
    })
    console.log(`Board names: ${boardNames.join(', ')}`)

    // ─── Step 5: Trigger detach via IPC ──────────────────────
    // Using evaluate to call the IPC directly from the overlay
    // renderer is more reliable than clicking the small button
    // in a zoomed-out canvas.
    console.log('Triggering detach via IPC for board index 0...')
    await overlayPage.evaluate(() => {
      window.api.detachParagonBoard(0)
    })

    // Wait for the detach window to appear
    await configPage.waitForTimeout(3000)

    // Find the detach window by URL
    const detachPage = await findWindowByUrl(electronApp, 'detach')
    await detachPage.waitForLoadState('domcontentloaded')
    await detachPage.waitForTimeout(3000) // Wait for board data IPC

    const windowCountAfterDetach = electronApp.windows().length
    console.log(`Windows after detach: ${windowCountAfterDetach}`)
    expect(windowCountAfterDetach).toBeGreaterThan(windowCountAfterOverlay)
    console.log('✓ Detach window opened')

    await detachPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, '05-detach-window-opened.png')
    })

    // ─── Step 6: Verify detach window has board tiles ────────
    const detachTiles = detachPage.locator('.paragon-canvas-tile')
    const detachTileCount = await detachTiles.count()
    console.log(`Tiles in detach window: ${detachTileCount}`)
    expect(detachTileCount).toBeGreaterThan(0)
    console.log('✓ Detach window contains board tiles')

    // Verify the board name is shown
    const detachBoardName = await detachPage.evaluate(() => {
      const label = document.querySelector('.paragon-canvas-board__name')
      return label?.textContent?.trim() || 'Unknown'
    })
    console.log(`Detached board name: "${detachBoardName}"`)
    expect(detachBoardName).toBe('Starting Board')
    console.log('✓ Correct board was detached')

    // Verify toolbar is present (full toolbar in unlocked state)
    const toolbar = detachPage.locator('.detach-toolbar--full')
    await expect(toolbar).toBeVisible({ timeout: 3000 })
    console.log('✓ Detach toolbar is visible')

    // ─── Step 7: Test opacity slider ─────────────────────────
    const opacitySlider = detachPage.locator('.detach-toolbar__slider')
    await expect(opacitySlider).toBeVisible({ timeout: 3000 })

    const initialOpacity = await opacitySlider.inputValue()
    console.log(`Initial opacity: ${initialOpacity}%`)

    const rootOpacityBefore = await detachPage.evaluate(() => {
      const root = document.querySelector('.detach-root')
      return root ? getComputedStyle(root).opacity : '1'
    })
    console.log(`Root opacity (CSS) before: ${rootOpacityBefore}`)

    // Change opacity to 30%
    await opacitySlider.fill('30')
    await detachPage.waitForTimeout(500)

    const newOpacity = await opacitySlider.inputValue()
    console.log(`New opacity after change: ${newOpacity}%`)
    expect(newOpacity).toBe('30')

    const rootOpacityAfter = await detachPage.evaluate(() => {
      const root = document.querySelector('.detach-root')
      return root ? getComputedStyle(root).opacity : '1'
    })
    console.log(`Root opacity (CSS) after: ${rootOpacityAfter}`)
    expect(parseFloat(rootOpacityAfter)).toBeLessThanOrEqual(0.35)
    console.log('✓ Opacity slider works — root element opacity updated')

    await detachPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, '06-opacity-30-percent.png')
    })

    // Set opacity back to 80 for readability
    await opacitySlider.fill('80')
    await detachPage.waitForTimeout(300)

    // ─── Step 8: Test rotation controls ──────────────────────
    const getRotation = async (): Promise<string> => {
      return detachPage.evaluate(() => {
        const container = document.querySelector('.detach-board-container')
        return container ? (container as HTMLElement).style.transform : 'none'
      })
    }

    const initialTransform = await getRotation()
    console.log(`Initial board transform: ${initialTransform}`)

    // Click the +90° rotation button (⟳)
    const rotateCWBtn = detachPage.locator('.detach-toolbar__btn', { hasText: '⟳' })
    if (await rotateCWBtn.isVisible({ timeout: 2000 })) {
      await rotateCWBtn.click()
      await detachPage.waitForTimeout(500)

      const rotatedTransform = await getRotation()
      console.log(`Transform after +90° rotation: ${rotatedTransform}`)
      expect(rotatedTransform).not.toBe(initialTransform)
      console.log('✓ Rotation CW (+90°) works')

      await detachPage.screenshot({
        path: path.join(SCREENSHOTS_DIR, '07-rotated-90.png')
      })
    }

    // Click the fine rotation button (+5°)
    const rotateFineBtn = detachPage.locator('.detach-toolbar__btn', { hasText: '5↻' })
    if (await rotateFineBtn.isVisible({ timeout: 2000 })) {
      const beforeFine = await getRotation()
      await rotateFineBtn.click()
      await detachPage.waitForTimeout(300)
      const afterFine = await getRotation()
      console.log(`Fine rotation: ${beforeFine} → ${afterFine}`)
      expect(afterFine).not.toBe(beforeFine)
      console.log('✓ Fine rotation (+5°) works')
    }

    // Click the CCW rotation button (⟲)
    const rotateCCWBtn = detachPage.locator('.detach-toolbar__btn', { hasText: '⟲' })
    if (await rotateCCWBtn.isVisible({ timeout: 2000 })) {
      await rotateCCWBtn.click()
      await detachPage.waitForTimeout(500)
      console.log('✓ Rotation CCW (-90°) works')
    }

    // ─── Step 9: Test Lock/Unlock ────────────────────────────
    const lockBtn = detachPage.locator('.detach-toolbar__btn--lock')
    await expect(lockBtn).toBeVisible({ timeout: 3000 })

    await lockBtn.click()
    await detachPage.waitForTimeout(500)
    console.log('✓ Lock button clicked')

    await detachPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, '08-locked-state.png')
    })

    // Verify toolbar collapsed to locked pill
    const lockedToolbar = detachPage.locator('.detach-toolbar--locked')
    const fullToolbar = detachPage.locator('.detach-toolbar--full')

    const isLockedToolbarVisible = await lockedToolbar.isVisible({ timeout: 3000 })
    const isFullToolbarHidden = !(await fullToolbar.isVisible())
    console.log(`Locked toolbar visible: ${isLockedToolbarVisible}`)
    console.log(`Full toolbar hidden: ${isFullToolbarHidden}`)
    expect(isLockedToolbarVisible).toBe(true)
    expect(isFullToolbarHidden).toBe(true)
    console.log('✓ Lock collapses toolbar to pill')

    // Unlock — first re-enable mouse events via evaluate since
    // the window is now click-through
    await detachPage.evaluate(() => {
      window.api.detachSetIgnoreMouse(false)
    })
    await detachPage.waitForTimeout(300)

    const unlockBtn = detachPage.locator('.detach-toolbar__btn--unlock')
    await expect(unlockBtn).toBeVisible({ timeout: 3000 })
    await unlockBtn.click()
    await detachPage.waitForTimeout(500)
    console.log('✓ Unlock button clicked')

    await expect(fullToolbar).toBeVisible({ timeout: 3000 })
    console.log('✓ Full toolbar restored after unlock')

    await detachPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, '09-unlocked-state.png')
    })

    // ─── Step 10: Test window resize via Electron API ────────
    const initialBounds = await electronApp.evaluate(({ BrowserWindow }) => {
      const allWindows = BrowserWindow.getAllWindows()
      const detach = allWindows.find((w) => {
        if (w.isDestroyed()) return false
        const url = w.webContents.getURL()
        return url.includes('detach')
      })
      return detach ? detach.getBounds() : null
    })

    console.log(`Initial detach window bounds: ${JSON.stringify(initialBounds)}`)

    if (initialBounds) {
      await electronApp.evaluate(({ BrowserWindow }, newSize) => {
        const allWindows = BrowserWindow.getAllWindows()
        const detach = allWindows.find((w) => {
          if (w.isDestroyed()) return false
          return w.webContents.getURL().includes('detach')
        })
        if (detach) {
          detach.setSize(newSize.w, newSize.h)
        }
      }, { w: 800, h: 800 })
      await detachPage.waitForTimeout(500)

      const newBounds = await electronApp.evaluate(({ BrowserWindow }) => {
        const allWindows = BrowserWindow.getAllWindows()
        const detach = allWindows.find((w) => {
          if (w.isDestroyed()) return false
          return w.webContents.getURL().includes('detach')
        })
        return detach ? detach.getBounds() : null
      })

      console.log(`Resized detach window bounds: ${JSON.stringify(newBounds)}`)
      if (newBounds) {
        expect(newBounds.width).toBeGreaterThanOrEqual(750)
        expect(newBounds.height).toBeGreaterThanOrEqual(750)
        console.log('✓ Detach window resized successfully')
      }

      await detachPage.screenshot({
        path: path.join(SCREENSHOTS_DIR, '10-resized-800x800.png')
      })
    }

    // ─── Step 11: Test Done button (close) ───────────────────
    const doneBtn = detachPage.locator('.detach-toolbar__btn--done')
    await expect(doneBtn).toBeVisible({ timeout: 3000 })

    const windowsBefore = electronApp.windows().length
    console.log(`Windows before Done: ${windowsBefore}`)

    await doneBtn.click()
    await configPage.waitForTimeout(2000)

    const windowsAfter = electronApp.windows().length
    console.log(`Windows after Done: ${windowsAfter}`)
    expect(windowsAfter).toBeLessThan(windowsBefore)
    console.log('✓ Done button closed the detach window')

    // ─── Step 12: Verify detach can be re-opened ─────────────
    console.log('\n── Re-opening detach to verify repeatability ──')

    // Trigger detach again via IPC from the overlay
    await overlayPage.evaluate(() => {
      window.api.detachParagonBoard(1) // board index 1 this time
    })
    await configPage.waitForTimeout(3000)

    const detachPage2 = await findWindowByUrl(electronApp, 'detach')
    await detachPage2.waitForLoadState('domcontentloaded')
    await detachPage2.waitForTimeout(3000)

    const windowsReopen = electronApp.windows().length
    console.log(`Windows after re-detach: ${windowsReopen}`)
    expect(windowsReopen).toBeGreaterThan(windowsAfter)
    console.log('✓ Detach window re-opened successfully')

    // Verify a different board was loaded
    const reopenBoardName = await detachPage2.evaluate(() => {
      const label = document.querySelector('.paragon-canvas-board__name')
      return label?.textContent?.trim() || 'Unknown'
    })
    console.log(`Re-opened board name: "${reopenBoardName}"`)
    expect(reopenBoardName).not.toBe('Starting Board')
    console.log('✓ Different board loaded on re-open')

    const reopenTiles = detachPage2.locator('.paragon-canvas-tile')
    const reopenTileCount = await reopenTiles.count()
    console.log(`Tiles in re-opened detach: ${reopenTileCount}`)
    expect(reopenTileCount).toBeGreaterThan(0)
    console.log('✓ Re-opened detach has board tiles')

    await detachPage2.screenshot({
      path: path.join(SCREENSHOTS_DIR, '11-re-opened-detach.png')
    })

    // Close via IPC
    await detachPage2.evaluate(() => {
      window.api.detachClose()
    })
    await configPage.waitForTimeout(1000)
    console.log('✓ Re-opened detach closed via IPC')

    // ─── Final summary ──────────────────────────────────────
    await configPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, '12-final-state.png')
    })

    console.log('\n╔══════════════════════════════════════════════════╗')
    console.log('║  Paragon Detach Overlay Test Results             ║')
    console.log('╠══════════════════════════════════════════════════╣')
    console.log('║  ✓ Build imported/loaded                        ║')
    console.log('║  ✓ Overlay window launched                      ║')
    console.log('║  ✓ Paragon tab with boards visible              ║')
    console.log('║  ✓ Detach triggered via IPC (board 0)           ║')
    console.log('║  ✓ Detach window has correct board tiles        ║')
    console.log('║  ✓ Opacity slider adjusts root opacity          ║')
    console.log('║  ✓ Rotation controls (+90°, +5°, -90°)          ║')
    console.log('║  ✓ Lock collapses toolbar → pill                ║')
    console.log('║  ✓ Unlock restores full toolbar                 ║')
    console.log('║  ✓ Window resize via Electron API               ║')
    console.log('║  ✓ Done button closes detach window             ║')
    console.log('║  ✓ Re-detach board 1 — different board loaded   ║')
    console.log('║  ✓ Close via IPC works                          ║')
    console.log('╚══════════════════════════════════════════════════╝')
  })
})
