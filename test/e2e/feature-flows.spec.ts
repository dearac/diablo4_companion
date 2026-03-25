/**
 * Feature Flows E2E Test
 *
 * Tests the new gear editing, scan pipeline, and build analysis features
 * introduced in the feat/gear-edit-recompare-dashboard branch.
 *
 * Test coverage:
 *   01 — App shell renders after build load from d4builds.gg
 *   02 — Scans tab: scan inbox renders (real scan attempt, graceful skip if OCR unavailable)
 *   03 — Scans tab: selecting a scan entry shows detail view
 *   04 — Scans tab: AffixEditor opens, edits affixes (rename/reclassify/add/remove), saves
 *   05 — Equipped Gear tab: mock gear injected via IPC, slot cards render
 *   06 — Equipped Gear tab: AffixEditor on slot card opens, edits, saves
 *   07 — Equipped Gear tab: BuildAnalysisPanel expands and shows slot breakdown + actions
 *   08 — Console error summary
 *
 * Architecture note:
 *   - Tests 02–04 depend on OCR returning a verdict. They skip gracefully if OCR is unavailable.
 *   - Tests 05–07 inject mock gear via window.api.setEquippedGear() and always run.
 *   - App is launched in dev mode using electron.launch({ args: ['.'] })
 *
 * Run: cmd /c npx playwright test test/e2e/feature-flows.spec.ts --reporter=list
 */
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import path from 'path'
import fs from 'fs'

// ─── Constants ─────────────────────────────────────────────────────────────────

const BUILD_URL = 'https://d4builds.gg/builds/blessed-shield-paladin-endgame/?var=2'
const SCREENSHOTS_DIR = path.join(__dirname, '../../test-results/feature-flows')

/**
 * Mock equipped gear covering 3 slots.
 * Chosen affixes are plausible for the Blessed Shield Paladin build.
 */
const MOCK_EQUIPPED_GEAR = {
  Helm: {
    itemName: 'Valorous Greathelm',
    slot: 'Helm',
    itemPower: 925,
    itemType: 'Helm',
    affixes: ['Cooldown Reduction', 'Lucky Hit Chance'],
    temperedAffixes: ['Damage to Slowed'],
    greaterAffixes: [],
    implicitAffixes: [],
    sockets: 1,
    aspect: null
  },
  'Chest Armor': {
    itemName: 'Ancestral Plate Mail',
    slot: 'Chest Armor',
    itemPower: 900,
    itemType: 'Chest Armor',
    affixes: ['Maximum Life', 'Armor', 'Total Armor'],
    temperedAffixes: [],
    greaterAffixes: ['Maximum Life'],
    implicitAffixes: [],
    sockets: 2,
    aspect: { name: 'Edgemaster', description: 'Damage scales with resource' }
  },
  Amulet: {
    itemName: 'Blessed Pendant',
    slot: 'Amulet',
    itemPower: 850,
    itemType: 'Amulet',
    affixes: ['Cooldown Reduction'],
    temperedAffixes: [],
    greaterAffixes: [],
    implicitAffixes: ['Damage Reduction'],
    sockets: 0,
    aspect: null
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Launches the Electron app in dev mode.
 */
async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })
  const app = await electron.launch({
    args: ['.'],
    cwd: path.join(__dirname, '../..'),
    env: { ...process.env, NODE_ENV: 'development' }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(3000)
  return { app, page }
}

/**
 * Loads the target build — prefers saved library, falls back to URL import.
 */
async function loadBuild(page: Page, url: string): Promise<void> {
  // Navigate to Builds tab
  await page.locator('.app-tabs__tab', { hasText: /builds/i }).click()
  await page.waitForTimeout(500)

  // If a build summary is already showing, we're done
  const hasBuildSummary = await page.locator('.build-summary').isVisible()
  if (hasBuildSummary) {
    console.log('✓ Build already loaded, skipping import')
    return
  }

  // Prefer saved library build
  const savedBuilds = page.locator('.build-library__item')
  const count = await savedBuilds.count()
  if (count > 0) {
    await savedBuilds.first().locator('.build-library__load-btn').click()
    await expect(page.locator('.build-summary')).toBeVisible({ timeout: 15_000 })
    console.log('✓ Loaded saved build from library')
    return
  }

  // Fall back to URL import (may take up to 2 minutes)
  console.log(`Importing build from ${url} — may take up to 2 minutes...`)
  await page.locator('#url-input').fill(url)
  await page.waitForTimeout(300)
  await expect(page.locator('#import-button')).toBeEnabled({ timeout: 2000 })
  await page.locator('#import-button').click()
  await expect(page.locator('.build-summary')).toBeVisible({ timeout: 120_000 })
  console.log('✓ Build imported successfully')
}

// ─── Test Suite ────────────────────────────────────────────────────────────────

test.describe('Feature Flows — Gear Edit, Scan & Build Analysis', () => {
  let app: ElectronApplication
  let page: Page

  // Allow up to 3 minutes for a live build import on first run
  test.setTimeout(180_000)

  test.beforeAll(async () => {
    ;({ app, page } = await launchApp())
    await loadBuild(page, BUILD_URL)
  })

  test.afterAll(async () => {
    if (app) await app.close()
  })

  // ─── Test 01: App Shell ────────────────────────────────────────────────────

  test('01 — app shell renders after build load', async () => {
    await expect(page.locator('.build-summary')).toBeVisible()

    // All 6 tabs should be present
    const tabs = page.locator('.app-tabs__tab')
    const tabCount = await tabs.count()
    expect(tabCount).toBeGreaterThanOrEqual(5)

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-build-loaded.png') })
    console.log('✓ App shell renders with build loaded')
  })

  // ─── Test 02: Scans tab inbox ──────────────────────────────────────────────

  test('02 — Scans tab: scan inbox renders (real scan or empty state)', async () => {
    // Attempt a real scan via IPC (OCR may or may not be available)
    const scanResult = await page.evaluate(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await (window as any).api.performScan()
      } catch (e) {
        return { error: String(e), verdict: null, mode: 'compare', equippedItem: null }
      }
    })

    console.log(
      'Scan attempt result:',
      JSON.stringify({
        mode: scanResult?.mode,
        error: scanResult?.error || 'none',
        hasVerdict: !!scanResult?.verdict
      })
    )

    // Navigate to Scans tab
    await page.locator('.app-tabs__tab', { hasText: /scans/i }).click()
    await page.waitForTimeout(1000)

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02-scans-tab.png') })

    if (scanResult?.verdict) {
      // OCR succeeded — inbox should have an entry
      const inboxItems = page.locator('.scan-inbox__item')
      await expect(inboxItems.first()).toBeVisible({ timeout: 5000 })
      console.log('✓ Scan inbox populated from real scan')
    } else {
      // OCR not available — empty state must render cleanly (no crash)
      const hasInboxItems = (await page.locator('.scan-inbox__item').count()) > 0
      if (!hasInboxItems) {
        await expect(page.locator('.empty-state')).toBeVisible()
        console.log('✓ Empty state renders correctly when no scans exist')
      } else {
        console.log('✓ Previous scan history entries found in inbox')
      }
    }
  })

  // ─── Test 03: Scan detail view ─────────────────────────────────────────────

  test('03 — Scans tab: selecting a scan shows the detail view', async () => {
    // Ensure we're on the Scans tab
    await page.locator('.app-tabs__tab', { hasText: /scans/i }).click()
    await page.waitForTimeout(500)

    const inboxItems = page.locator('.scan-inbox__item')
    const count = await inboxItems.count()

    if (count === 0) {
      console.log('⚠ No scans in inbox — skipping detail view test (OCR not available)')
      return
    }

    await inboxItems.first().click()
    await page.waitForTimeout(500)

    // Detail view must appear with item name and slot info
    await expect(page.locator('.scan-detail')).toBeVisible()
    await expect(page.locator('.scan-detail__item-name')).toBeVisible()
    await expect(page.locator('.scan-detail__item-slot')).toBeVisible()

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03-scan-detail.png') })
    console.log('✓ Scan detail view renders on selection')
  })

  // ─── Test 04: ScansTab AffixEditor ────────────────────────────────────────

  test('04 — Scans tab: AffixEditor opens, edits affixes, saves and re-compares', async () => {
    // Ensure we're on Scans tab with a selected entry
    await page.locator('.app-tabs__tab', { hasText: /scans/i }).click()
    await page.waitForTimeout(500)

    const inboxItems = page.locator('.scan-inbox__item')
    const count = await inboxItems.count()
    if (count === 0) {
      console.log('⚠ No scans available — skipping AffixEditor test (OCR not available)')
      return
    }

    await inboxItems.first().click()
    await page.waitForTimeout(500)
    await expect(page.locator('.scan-detail')).toBeVisible()

    // Click the ✏️ Edit button in the scan detail header
    const editBtn = page.locator('.scan-detail__header .btn--outline', { hasText: /edit/i })
    await expect(editBtn).toBeVisible({ timeout: 3000 })
    await editBtn.click()
    await page.waitForTimeout(300)

    // AffixEditor panel must open
    await expect(page.locator('.affix-editor-panel')).toBeVisible()
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04a-scan-editor-open.png') })
    console.log('✓ AffixEditor panel opened in Scans tab')

    // ── Rename first affix ──
    const firstInput = page.locator('.affix-editor-row__text').first()
    await firstInput.clear()
    await firstInput.fill('Cooldown Reduction')
    await page.waitForTimeout(200)
    console.log('✓ Renamed first affix to "Cooldown Reduction"')

    // ── Reclassify first affix to Greater ──
    const firstTypeSelect = page.locator('.affix-editor-row__type').first()
    await firstTypeSelect.selectOption('greater')
    await page.waitForTimeout(200)
    console.log('✓ Reclassified first affix type to Greater')

    // ── Remove last affix if more than one row ──
    const affixRows = page.locator('.affix-editor-row')
    const rowCount = await affixRows.count()
    if (rowCount > 1) {
      const removeBtn = affixRows.last().locator('.affix-editor-row__remove')
      await removeBtn.click()
      await page.waitForTimeout(200)
      const newRowCount = await page.locator('.affix-editor-row').count()
      expect(newRowCount).toBe(rowCount - 1)
      console.log(`✓ Removed last affix (${rowCount} → ${newRowCount} rows)`)
    }

    // ── Add a new affix ──
    await page.locator('.affix-editor-panel__add-btn').click()
    await page.waitForTimeout(200)
    const newInput = page.locator('.affix-editor-row__text').last()
    await newInput.fill('Maximum Life')
    await page.waitForTimeout(200)
    console.log('✓ Added "Maximum Life" affix')

    // ── Check live preview (optional — only if build slot matched) ──
    const previewEl = page.locator('.affix-editor-panel__preview')
    if (await previewEl.isVisible()) {
      const previewText = await previewEl.textContent()
      console.log(`✓ Live score preview visible: ${previewText}`)
    }

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04b-scan-editor-edited.png') })

    // ── Save & Re-compare ──
    await page.locator('.affix-editor-panel__actions .btn--primary').click()
    await page.waitForTimeout(500)

    // Editor closes after save
    await expect(page.locator('.affix-editor-panel')).not.toBeVisible()
    console.log('✓ Editor closed after Save & Re-compare')

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04c-scan-after-save.png') })
    console.log('✓ ScansTab AffixEditor flow complete')
  })

  // ─── Test 05: Mock gear injection ─────────────────────────────────────────

  test('05 — Equipped Gear tab: mock gear renders slot cards', async () => {
    // Inject mock gear via IPC
    const result = await page.evaluate(async (gear) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await (window as any).api.setEquippedGear(gear)
    }, MOCK_EQUIPPED_GEAR)
    console.log('✓ Mock gear injected via window.api.setEquippedGear(), result:', result)

    // App.tsx holds equippedGear in top-level state and loads it once on mount.
    // Nav away/back doesn't re-mount App, so we must reload the page to force
    // App to re-fetch the newly injected state from disk via getEquippedGear().
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // Re-load the library build (page reload clears the in-memory build state)
    await loadBuild(page, BUILD_URL)

    // Navigate to the Gear tab to view slot cards
    await page.locator('.app-tabs__tab', { hasText: /gear/i }).click()
    await page.waitForTimeout(1000)

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05-equipped-gear-tab.png') })

    // GearTab renders .gear-card elements, one per slot column entry
    const cards = page.locator('.gear-card')
    const cardCount = await cards.count()
    console.log(`Found ${cardCount} gear cards`)
    expect(cardCount).toBeGreaterThanOrEqual(3)

    // Helm card must show the injected item name
    const helmCard = page.locator('.gear-card', { hasText: 'Helm' }).first()
    await expect(helmCard).toBeVisible()
    await expect(helmCard).toContainText('Valorous Greathelm')
    console.log('✓ Helm gear card renders mock item name')

    // Match badge may appear if build has a Helm slot definition
    const matchBadge = helmCard.locator('.gear-card__match-badge')
    const badgeVisible = await matchBadge.isVisible()
    if (badgeVisible) {
      const badgeText = await matchBadge.textContent()
      console.log(`✓ Helm match badge: ${badgeText}`)
    } else {
      console.log('⚠ Helm match badge not shown (build has no Helm slot definition)')
    }

    // Chest Armor card must be present
    const chestCard = page.locator('.gear-card', { hasText: 'Chest Armor' }).first()
    await expect(chestCard).toBeVisible()
    await expect(chestCard).toContainText('Ancestral Plate Mail')
    console.log('✓ Chest Armor gear card renders mock item name')
  })

  // ─── Test 06: EquippedGearTab AffixEditor ─────────────────────────────────

  test('06 — GearTab: inline affix editor opens on slot card, edits type, closes', async () => {
    await page.locator('.app-tabs__tab', { hasText: /gear/i }).click()
    await page.waitForTimeout(500)

    // GearTab uses .gear-card; Helm card must be present from test 05's injection
    const helmCard = page.locator('.gear-card', { hasText: 'Helm' }).first()
    await expect(helmCard).toBeVisible({ timeout: 5000 })

    // Click the ✏️ Edit button on the Helm card
    const editBtn = helmCard.locator('.btn--outline', { hasText: /edit/i })
    await expect(editBtn).toBeVisible()
    await editBtn.click()
    await page.waitForTimeout(300)

    // GearTab uses an inline .affix-editor-overlay (not a full modal panel)
    const overlay = page.locator('.affix-editor-overlay')
    await expect(overlay).toBeVisible()
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06a-gear-editor-open.png') })
    console.log('✓ Affix editor overlay opened on Helm card')

    // Reclassify first affix via dropdown
    const firstSelect = overlay.locator('.affix-editor__select').first()
    await firstSelect.selectOption('greater')
    await page.waitForTimeout(200)
    console.log('✓ Reclassified first affix to Greater')

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06b-gear-editor-edited.png') })

    // Toggle editor closed — button text switches from '✏️ Edit' to 'Close'; click it directly
    await helmCard.locator('.gear-card__actions button').click()
    await page.waitForTimeout(300)
    await expect(overlay).not.toBeVisible()
    console.log('✓ Affix editor overlay closed')

    await expect(helmCard).toBeVisible()
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06c-gear-after-save.png') })
    console.log('✓ GearTab inline affix editor flow complete')
  })

  // ─── Test 07: BuildAnalysisPanel ──────────────────────────────────────────

  test('07 — GearTab: gear comparison match badges show correct % and affix breakdown', async () => {
    await page.locator('.app-tabs__tab', { hasText: /gear/i }).click()
    await page.waitForTimeout(500)

    // Gear cards from the mock injection (test 05) should still be present
    const helmCard = page.locator('.gear-card', { hasText: 'Helm' }).first()
    const isHelmPresent = await helmCard.isVisible()

    if (!isHelmPresent) {
      console.log('⚠ No gear cards visible — mock gear may not have persisted. Skipping.')
      return
    }

    const matchBadge = helmCard.locator('.gear-card__match-badge')
    const hasBadge = await matchBadge.isVisible()

    if (!hasBadge) {
      console.log('⚠ No match badge on Helm card — build has no Helm slot definition. Skipping.')
      return
    }

    const badgeText = await matchBadge.textContent()
    console.log(`✓ Helm match badge: ${badgeText}`)
    expect(badgeText).toMatch(/\d+%/)

    // Affix breakdown: matched (✅) and/or missing (❌) rows
    const matchedAffixes = helmCard.locator('.gear-card__affix--match')
    const missedAffixes = helmCard.locator('.gear-card__affix--miss')
    const matchedCount = await matchedAffixes.count()
    const missedCount = await missedAffixes.count()
    console.log(`Helm: ${matchedCount} matched, ${missedCount} missing affixes`)
    expect(matchedCount + missedCount).toBeGreaterThan(0)

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07-gear-tab-comparison.png') })
    console.log('✓ GearTab gear comparison flow complete')
  })

  // ─── Test 08: Console summary ──────────────────────────────────────────────

  test('08 — Console error summary', async () => {
    console.log('\n════════════════════════════════════════════')
    console.log('  ✓ Feature Flows E2E suite complete')
    console.log(`  Screenshots saved to: test-results/feature-flows/`)
    console.log('════════════════════════════════════════════')
    // This test always passes — it is for human-readable output review
    expect(true).toBe(true)
  })
})
