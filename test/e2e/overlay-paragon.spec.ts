/**
 * Overlay Paragon Board Layout Test
 *
 * End-to-end test that verifies the paragon boards render correctly
 * inside the transparent OVERLAY window (not the config window).
 *
 * The overlay uses the same shared ParagonBoardCanvas component as
 * the config window, but the rendering context is different:
 *   - Transparent fullscreen BrowserWindow
 *   - Mouse click-through by default
 *   - Build data arrives via IPC (overlay-ready → send-build-to-overlay)
 *   - Starts on the "Skills" tab — must navigate to "Paragon"
 *
 * Checks:
 *   - Overlay window spawns and receives build data
 *   - Board count = 5
 *   - Board rotations match d4builds (0°, 90°, 180°, 270°, 90°)
 *   - Spatial arrangement is a 2D grid (not a linear chain)
 *   - Connection lines = 8 (4 connections × 2 SVG layers)
 *   - Screenshots captured for visual review
 */
import { test, expect, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'
import path from 'path'
import fs from 'fs'

const SCREENSHOTS_DIR = path.join(__dirname, '../../test-results/overlay-paragon')

/** Fallback build URL when no saved builds exist */
const FALLBACK_BUILD_URL =
  'https://d4builds.gg/builds/blessed-hammer-paladin-endgame/?var=0'

/**
 * Expected board data for the Hammerdin build from d4builds.gg.
 */
const EXPECTED_BOARDS = [
  { name: 'Starting Board', rotation: 0 },
  { name: 'Castle', rotation: 90 },
  { name: 'Shield Bearer', rotation: 180 },
  { name: 'Relentless', rotation: 270 },
  { name: 'Beacon', rotation: 90 }
]

// ============================================================
// Helpers
// ============================================================

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

/**
 * Finds the overlay window among all open Electron windows.
 * The overlay loads overlay.html, so we match on that.
 */
async function findOverlayWindow(
  electronApp: ElectronApplication,
  timeoutMs = 15_000
): Promise<Page> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const windows = electronApp.windows()
    for (const w of windows) {
      const url = w.url()
      if (url.includes('overlay.html') || url.includes('overlay')) {
        // Make sure it has finished loading
        await w.waitForLoadState('domcontentloaded')
        return w
      }
    }
    // Wait a bit and check again
    await new Promise((r) => setTimeout(r, 500))
  }

  throw new Error(`Overlay window not found within ${timeoutMs}ms`)
}

// ============================================================
// Test
// ============================================================

test.describe('Overlay Paragon Board Layout', () => {
  let electronApp: ElectronApplication
  let configPage: Page
  let overlayPage: Page

  // Allow up to 3 minutes for live import + overlay launch
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

  test('paragon boards render correctly in the overlay window', async () => {
    // ─── Step 1: Load a build in the config window ──────────────
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
    console.log('✓ Build loaded in config window')

    // ─── Step 2: Launch the overlay ─────────────────────────────
    const launchBtn = configPage.locator('#launch-overlay-button')
    await expect(launchBtn).toBeVisible({ timeout: 5000 })
    await launchBtn.click()
    console.log('Launching overlay window...')

    // ─── Step 3: Get the overlay window ─────────────────────────
    overlayPage = await findOverlayWindow(electronApp)
    console.log(`✓ Overlay window found: ${overlayPage.url()}`)

    // Wait for the overlay to receive build data via IPC
    await overlayPage.waitForTimeout(3000)

    // ─── Step 4: Navigate to the Paragon tab ────────────────────
    // The overlay starts on the Skills tab. Click the Paragon tab.
    const paragonTab = overlayPage.locator('.tab-bar__tab', { hasText: /paragon/i })
    await expect(paragonTab).toBeVisible({ timeout: 5000 })
    await paragonTab.click()
    await overlayPage.waitForTimeout(1000)
    console.log('✓ Navigated to Paragon tab in overlay')

    // ─── Step 5: Verify canvas and board count ──────────────────
    const canvas = overlayPage.locator('.paragon-canvas')
    await expect(canvas).toBeVisible({ timeout: 5000 })

    const boardGroups = overlayPage.locator('.paragon-canvas__board-group')
    const boardCount = await boardGroups.count()
    console.log(`Board groups rendered in overlay: ${boardCount}`)
    expect(boardCount).toBe(5)

    // ─── Step 6: Extract board layout data from the DOM ─────────
    const boardData = await overlayPage.evaluate(() => {
      const groups = document.querySelectorAll('.paragon-canvas__board-group')
      const results: Array<{
        index: number
        left: number
        top: number
        width: number
        height: number
        transform: string
        rotation: number
        boardName: string
      }> = []

      groups.forEach((group, i) => {
        const style = (group as HTMLElement).style
        const left = parseFloat(style.left) || 0
        const top = parseFloat(style.top) || 0
        const width = parseFloat(style.width) || 0
        const height = parseFloat(style.height) || 0
        const transform = style.transform || 'none'

        const rotMatch = transform.match(/rotate\(([-0-9.]+)deg\)/)
        const rotation = rotMatch ? parseFloat(rotMatch[1]) : 0

        const label = group.querySelector('.paragon-canvas-board__name')
        const boardName = label?.textContent?.trim() || `Board ${i}`

        results.push({ index: i, left, top, width, height, transform, rotation, boardName })
      })

      return results
    })

    console.log('\n╔══════════════════════════════════════════════════╗')
    console.log('║  Overlay Board Layout Data                      ║')
    console.log('╠══════════════════════════════════════════════════╣')
    for (const b of boardData) {
      console.log(
        `║  [${b.index}] ${b.boardName.padEnd(16)} ` +
          `rot=${String(b.rotation).padStart(3)}°  ` +
          `pos=(${Math.round(b.left)}, ${Math.round(b.top)})`.padEnd(22) +
          '║'
      )
    }
    console.log('╚══════════════════════════════════════════════════╝')

    // ─── Step 7: Verify board rotations ─────────────────────────
    console.log('\n── Rotation Verification (Overlay) ──')
    for (let i = 0; i < EXPECTED_BOARDS.length; i++) {
      const expected = EXPECTED_BOARDS[i]
      const actual = boardData[i]

      if (!actual) {
        console.log(`✗ Board ${i} (${expected.name}): MISSING from overlay DOM`)
        continue
      }

      console.log(
        `Board ${i} (${actual.boardName}): ` +
          `expected rot=${expected.rotation}°, got rot=${actual.rotation}°`
      )
      expect(actual.rotation).toBe(expected.rotation)
    }
    console.log('✓ All board rotations match in overlay')

    // ─── Step 8: Verify spatial arrangement ─────────────────────
    console.log('\n── Spatial Arrangement (Overlay) ──')

    const xPositions = boardData.map((b) => Math.round(b.left))
    const yPositions = boardData.map((b) => Math.round(b.top))

    const uniqueXCount = new Set(xPositions).size
    const uniqueYCount = new Set(yPositions).size

    console.log(`Unique X positions: ${uniqueXCount} — ${JSON.stringify([...new Set(xPositions)])}`)
    console.log(`Unique Y positions: ${uniqueYCount} — ${JSON.stringify([...new Set(yPositions)])}`)

    // 2D grid: at least 2 unique X and 2 unique Y
    expect(uniqueXCount).toBeGreaterThanOrEqual(2)
    expect(uniqueYCount).toBeGreaterThanOrEqual(2)

    // Use the largest board for tolerance
    const maxWidth = Math.max(...boardData.map((b) => b.width))
    const maxHeight = Math.max(...boardData.map((b) => b.height))
    const xTolerance = maxWidth * 0.5
    const yTolerance = maxHeight * 0.5

    // Board 0 and Board 1 should share X column
    const board0X = boardData[0].left
    const board1X = boardData[1].left
    expect(Math.abs(board0X - board1X)).toBeLessThan(xTolerance)
    console.log(
      `✓ Board 0 and 1 share X column (Δ=${Math.round(Math.abs(board0X - board1X))}px)`
    )

    // Board 2 and Board 3 should share X column
    const board2X = boardData[2].left
    const board3X = boardData[3].left
    expect(Math.abs(board2X - board3X)).toBeLessThan(xTolerance)
    console.log(
      `✓ Board 2 and 3 share X column (Δ=${Math.round(Math.abs(board2X - board3X))}px)`
    )

    // Board 1 and Board 2 should share Y row
    const board1Y = boardData[1].top
    const board2Y = boardData[2].top
    expect(Math.abs(board1Y - board2Y)).toBeLessThan(yTolerance)
    console.log(
      `✓ Board 1 and 2 share Y row (Δ=${Math.round(Math.abs(board1Y - board2Y))}px)`
    )

    // Board 3 and Board 4 should share Y row
    const board3Y = boardData[3].top
    const board4Y = boardData[4].top
    expect(Math.abs(board3Y - board4Y)).toBeLessThan(yTolerance)
    console.log(
      `✓ Board 3 and 4 share Y row (Δ=${Math.round(Math.abs(board3Y - board4Y))}px)`
    )

    console.log('✓ Spatial arrangement matches 2×2+1 grid in overlay')

    // ─── Step 9: Verify connection lines ────────────────────────
    const connectionLines = overlayPage.locator('.paragon-canvas__connections line')
    const lineCount = await connectionLines.count()
    console.log(`\nConnection lines in overlay SVG: ${lineCount} (expected 8)`)
    expect(lineCount).toBe(8)
    console.log('✓ Connection lines rendered correctly in overlay')

    // ─── Step 10: Screenshots ──────────────────────────────────
    // Click fit-all to show the complete layout
    const fitBtn = overlayPage.locator('.paragon-canvas__tool-btn--fit')
    if (await fitBtn.isVisible()) {
      await fitBtn.click()
      await overlayPage.waitForTimeout(500)
    }

    await overlayPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, '01-overlay-paragon-layout.png')
    })
    console.log('\n✓ Saved: 01-overlay-paragon-layout.png')

    // Also take a config window screenshot for comparison
    // Expand paragon in config window
    const paragonToggle = configPage.locator('.build-summary__section-toggle', {
      hasText: /paragon/i
    })
    if (await paragonToggle.isVisible()) {
      await paragonToggle.click()
      await configPage.waitForTimeout(1000)
    }
    await configPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, '02-config-paragon-layout.png')
    })
    console.log('✓ Saved: 02-config-paragon-layout.png')

    // ─── Final summary ──────────────────────────────────────────
    console.log('\n════════════════════════════════════════')
    console.log('  ✓ All overlay paragon checks passed')
    console.log('════════════════════════════════════════')
    console.log('\nOverlay board layout:')
    console.log('  ┌─────────────────┬─────────────────┐')
    console.log('  │  Beacon (90°)   │ Relentless(270°)│')
    console.log('  ├─────────────────┼─────────────────┤')
    console.log('  │  Castle (90°)   │ Shield B.(180°) │')
    console.log('  └────────┬────────┴─────────────────┘')
    console.log('           │  Starting (0°)  │')
    console.log('           └─────────────────┘')
  })
})
