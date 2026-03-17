/**
 * Paragon Board Visual Layout Test
 *
 * End-to-end test that verifies the paragon boards are rendered
 * with correct spatial positioning and rotation, matching the
 * layout from d4builds.gg.
 *
 * Checks:
 *   - Board positions form a 2D spatial grid (not a linear chain)
 *   - Board rotations match the scraped values (0°, 90°, 180°, 270°)
 *   - Connection lines exist between consecutive boards
 *   - Zoomed-in screenshots of each board for visual rotation review
 *   - Side-by-side comparison layout data vs d4builds reference
 *
 * @see TESTING_RULES.md — fallback build URL for import
 */
import { test, expect, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'
import path from 'path'
import fs from 'fs'

const SCREENSHOTS_DIR = path.join(__dirname, '../../test-results/paragon-visual')

/**
 * Default build URL to import when no saved builds exist.
 * @see TESTING_RULES.md
 */
const FALLBACK_BUILD_URL =
  'https://d4builds.gg/builds/blessed-hammer-paladin-endgame/?var=0'

/**
 * Expected board data for the Hammerdin build from d4builds.gg.
 * These values come from our DOM inspection of the live site.
 *
 * d4builds coordinate system:
 *   - 1258px per board unit
 *   - Starting board at (0, 0)
 *   - Negative Y = above the starting board
 */
const EXPECTED_BOARDS = [
  { name: 'Starting Board', rotation: 0, siteX: 0, siteY: 0 },
  { name: 'Castle', rotation: 90, siteX: 0, siteY: -1258 },
  { name: 'Shield Bearer', rotation: 180, siteX: 1258, siteY: -1258 },
  { name: 'Relentless', rotation: 270, siteX: 1258, siteY: -2516 },
  { name: 'Beacon', rotation: 90, siteX: 0, siteY: -2516 }
]

// ============================================================
// Helpers
// ============================================================

/**
 * Dispatches a WheelEvent directly on the canvas element.
 * Playwright's mouse.wheel() doesn't trigger React's synthetic onWheel handler.
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

// ============================================================
// Test
// ============================================================

test.describe('Paragon Board Visual Layout', () => {
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

  test('boards are spatially arranged with correct rotation (matching d4builds)', async () => {
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

    // ─── Step 2: Expand the Paragon section ─────────────────────
    const paragonToggle = configPage.locator('.build-summary__section-toggle', {
      hasText: /paragon/i
    })
    await expect(paragonToggle).toBeVisible({ timeout: 5000 })
    await paragonToggle.click()
    await configPage.waitForTimeout(1500)
    console.log('✓ Paragon section expanded')

    // ─── Step 3: Verify canvas and board count ──────────────────
    const canvas = configPage.locator('.paragon-canvas')
    await expect(canvas).toBeVisible({ timeout: 5000 })

    const boardGroups = configPage.locator('.paragon-canvas__board-group')
    const boardCount = await boardGroups.count()
    console.log(`Board groups rendered: ${boardCount}`)
    expect(boardCount).toBe(5)

    // ─── Step 4: Extract board layout data from the DOM ─────────
    // Read each board group's computed position and transform
    const boardData = await configPage.evaluate(() => {
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

        // Extract rotation from transform
        const rotMatch = transform.match(/rotate\(([-0-9.]+)deg\)/)
        const rotation = rotMatch ? parseFloat(rotMatch[1]) : 0

        // Get board name from the label
        const label = group.querySelector('.paragon-canvas-board__name')
        const boardName = label?.textContent?.trim() || `Board ${i}`

        results.push({ index: i, left, top, width, height, transform, rotation, boardName })
      })

      return results
    })

    console.log('\n╔══════════════════════════════════════════════════╗')
    console.log('║  Board Layout Data (from rendered DOM)           ║')
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

    // ─── Step 5: Verify board rotations ─────────────────────────
    console.log('\n── Rotation Verification ──')
    for (let i = 0; i < EXPECTED_BOARDS.length; i++) {
      const expected = EXPECTED_BOARDS[i]
      const actual = boardData[i]

      if (!actual) {
        console.log(`✗ Board ${i} (${expected.name}): MISSING from DOM`)
        continue
      }

      // Verify rotation matches
      console.log(
        `Board ${i} (${actual.boardName}): ` +
          `expected rot=${expected.rotation}°, got rot=${actual.rotation}°`
      )
      expect(actual.rotation).toBe(expected.rotation)
    }
    console.log('✓ All board rotations match d4builds')

    // ─── Step 6: Verify spatial arrangement ─────────────────────
    // The boards should form a 2D grid, NOT a linear chain.
    // Specifically, boards should share X or Y coordinates (grouped).
    console.log('\n── Spatial Arrangement Verification ──')

    // Check that at least 2 boards share the same approximate X
    // and at least 2 boards share the same approximate Y
    // (this proves it's a 2D grid, not a vertical chain)
    const xPositions = boardData.map((b) => Math.round(b.left))
    const yPositions = boardData.map((b) => Math.round(b.top))

    const uniqueXCount = new Set(xPositions).size
    const uniqueYCount = new Set(yPositions).size

    console.log(`Unique X positions: ${uniqueXCount} — ${JSON.stringify([...new Set(xPositions)])}`)
    console.log(`Unique Y positions: ${uniqueYCount} — ${JSON.stringify([...new Set(yPositions)])}`)

    // A 5-board 2×2+1 grid should have 2+ unique X values and 2+ unique Y values
    // A linear chain would have 1 unique X and 5 unique Y (or vice versa)
    expect(uniqueXCount).toBeGreaterThanOrEqual(2)
    expect(uniqueYCount).toBeGreaterThanOrEqual(2)

    // Use the largest board width for tolerance (Starting Board is smaller
    // and centered within its column, so it has a slight X offset)
    const maxWidth = Math.max(...boardData.map((b) => b.width))
    const maxHeight = Math.max(...boardData.map((b) => b.height))
    const xTolerance = maxWidth * 0.5
    const yTolerance = maxHeight * 0.5

    // Verify the relative positioning matches d4builds grid pattern:
    // Board 0 (siteX=0) and Board 1 (siteX=0) should share the same X column
    // (Starting Board is centered, so allow wider tolerance)
    const board0X = boardData[0].left
    const board1X = boardData[1].left
    expect(Math.abs(board0X - board1X)).toBeLessThan(xTolerance)
    console.log(
      `✓ Board 0 and 1 share X column (Δ=${Math.round(Math.abs(board0X - board1X))}px, ` +
        `tolerance=${Math.round(xTolerance)}px)`
    )

    // Board 2 (siteX=1258) and Board 3 (siteX=1258) should have similar X
    const board2X = boardData[2].left
    const board3X = boardData[3].left
    expect(Math.abs(board2X - board3X)).toBeLessThan(xTolerance)
    console.log(
      `✓ Board 2 and 3 share X column (Δ=${Math.round(Math.abs(board2X - board3X))}px, ` +
        `tolerance=${Math.round(xTolerance)}px)`
    )

    // Board 1 (siteY=-1258) and Board 2 (siteY=-1258) should have similar Y
    const board1Y = boardData[1].top
    const board2Y = boardData[2].top
    expect(Math.abs(board1Y - board2Y)).toBeLessThan(yTolerance)
    console.log(
      `✓ Board 1 and 2 share Y row (Δ=${Math.round(Math.abs(board1Y - board2Y))}px, ` +
        `tolerance=${Math.round(yTolerance)}px)`
    )

    // Board 3 (siteY=-2516) and Board 4 (siteY=-2516) should have similar Y
    const board3Y = boardData[3].top
    const board4Y = boardData[4].top
    expect(Math.abs(board3Y - board4Y)).toBeLessThan(yTolerance)
    console.log(
      `✓ Board 3 and 4 share Y row (Δ=${Math.round(Math.abs(board3Y - board4Y))}px, ` +
        `tolerance=${Math.round(yTolerance)}px)`
    )

    console.log('✓ Spatial arrangement matches d4builds 2×2+1 grid')

    // ─── Step 7: Verify connection lines ────────────────────────
    const connectionLines = configPage.locator('.paragon-canvas__connections line')
    const lineCount = await connectionLines.count()
    // We have 5 boards → 4 connections, each with 2 SVG lines (glow + crisp)
    console.log(`\nConnection lines in SVG: ${lineCount} (expected 8 = 4 connections × 2 layers)`)
    expect(lineCount).toBe(8)
    console.log('✓ Connection lines rendered correctly')

    // ─── Step 8: Full canvas screenshot ─────────────────────────
    // Click fit-all to show the complete layout
    const fitBtn = configPage.locator('.paragon-canvas__tool-btn--fit')
    if (await fitBtn.isVisible()) {
      await fitBtn.click()
      await configPage.waitForTimeout(500)
    }

    await configPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, '01-full-layout.png')
    })
    console.log('\n✓ Saved: 01-full-layout.png')

    // ─── Step 9: Zoom into each board for close-up screenshots ──
    const canvasBox = await canvas.boundingBox()
    expect(canvasBox).not.toBeNull()

    for (let i = 0; i < boardCount; i++) {
      const group = boardGroups.nth(i)
      const boardBox = await group.boundingBox()
      if (!boardBox) continue

      // First, fit-all to reset view
      if (await fitBtn.isVisible()) {
        await fitBtn.click()
        await configPage.waitForTimeout(300)
      }

      // Zoom into this board's area
      const boardCenterX = boardBox.x + boardBox.width / 2
      const boardCenterY = boardBox.y + boardBox.height / 2

      // Zoom in toward the board center
      for (let z = 0; z < 15; z++) {
        await dispatchWheelOnCanvas(configPage, -120, boardCenterX, boardCenterY)
        await configPage.waitForTimeout(60)
      }
      await configPage.waitForTimeout(500)

      const boardName = boardData[i]?.boardName || `Board ${i}`
      const rotation = boardData[i]?.rotation || 0

      await configPage.screenshot({
        path: path.join(SCREENSHOTS_DIR, `02-board-${i}-${boardName.replace(/\s+/g, '-').toLowerCase()}-rot${rotation}.png`)
      })
      console.log(
        `✓ Saved: 02-board-${i}-${boardName.replace(/\s+/g, '-').toLowerCase()}-rot${rotation}.png`
      )
    }

    // ─── Step 10: Final summary ─────────────────────────────────
    // Reset view
    if (await fitBtn.isVisible()) {
      await fitBtn.click()
      await configPage.waitForTimeout(500)
    }

    await configPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, '03-final-overview.png')
    })

    console.log('\n════════════════════════════════════════')
    console.log('  ✓ All visual layout checks passed')
    console.log('════════════════════════════════════════')
    console.log('\nBoard layout summary:')
    console.log('  ┌─────────────────┬─────────────────┐')
    console.log('  │  Beacon (90°)   │ Relentless(270°)│')
    console.log('  ├─────────────────┼─────────────────┤')
    console.log('  │  Castle (90°)   │ Shield B.(180°) │')
    console.log('  └────────┬────────┴─────────────────┘')
    console.log('           │  Starting (0°)  │')
    console.log('           └─────────────────┘')
  })
})
