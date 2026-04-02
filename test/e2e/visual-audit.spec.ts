/**
 * Visual Audit E2E Test
 *
 * Launches the actual Electron app via electron-vite dev,
 * navigates every tab, captures screenshots, and monitors
 * the console for errors.
 *
 * Run:  npx playwright test test/e2e/visual-audit.spec.ts
 */
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import path from 'path'

const SCREENSHOT_DIR = path.join(__dirname, '..', '..', 'test-screenshots')

/** Tab IDs in order */
const TABS = ['builds', 'gear', 'skills', 'paragon', 'scans', 'settings'] as const

let app: ElectronApplication
let page: Page
const consoleLogs: { type: string; text: string }[] = []
const consoleErrors: { type: string; text: string }[] = []

test.describe('Diablo IV Companion — Visual Audit', () => {
  test.beforeAll(async () => {
    // Launch the Electron app in dev mode using electron-vite
    app = await electron.launch({
      args: ['.'],
      cwd: path.join(__dirname, '..', '..'),
      env: {
        ...process.env,
        NODE_ENV: 'development'
      }
    })

    // Get the first BrowserWindow
    page = await app.firstWindow()

    // Wait for app to fully load (Vite HMR + React hydration)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    // Monitor console messages
    page.on('console', (msg) => {
      const entry = { type: msg.type(), text: msg.text() }
      consoleLogs.push(entry)
      if (msg.type() === 'error' || msg.type() === 'warning') {
        consoleErrors.push(entry)
      }
    })

    // Monitor uncaught exceptions
    page.on('pageerror', (error) => {
      consoleErrors.push({ type: 'pageerror', text: error.message })
    })
  })

  test.afterAll(async () => {
    if (app) await app.close()
  })

  test('should render the app shell correctly', async () => {
    // Screenshot the initial state
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '00-initial-load.png'),
      fullPage: true
    })

    // Check the header exists
    const header = page.locator('.app-header')
    await expect(header).toBeVisible()

    // Check the title
    const title = page.locator('.app-header__title')
    await expect(title).toContainText('Diablo IV')

    // Check all 6 tabs are present
    const tabs = page.locator('.app-tabs__tab')
    const tabCount = await tabs.count()
    expect(tabCount).toBe(6)

    // Check status bar
    const statusBar = page.locator('.status-bar')
    await expect(statusBar).toBeVisible()

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-app-shell.png'), fullPage: true })
  })

  // Test each tab
  for (const [index, tabId] of TABS.entries()) {
    test(`Tab ${index + 1}: ${tabId.toUpperCase()} — should render without errors`, async () => {
      // Clear errors before tab click
      const errorsBefore = consoleErrors.length

      // Click the tab by finding the button with matching text
      const tabButton = page.locator('.app-tabs__tab', {
        hasText: new RegExp(tabId, 'i')
      })
      await tabButton.click()
      await page.waitForTimeout(1500)

      // Verify active state
      await expect(tabButton).toHaveClass(/app-tabs__tab--active/)

      // Screenshot viewport
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `02-tab-${tabId}-viewport.png`)
      })

      // Full page screenshot
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `03-tab-${tabId}-full.png`),
        fullPage: true
      })

      // Check for empty/blank content
      const mainContent = page.locator('.app-main')
      const mainBox = await mainContent.boundingBox()
      expect(mainBox).not.toBeNull()
      if (mainBox) {
        expect(mainBox.height).toBeGreaterThan(10)
      }

      // Check for new console errors since this tab was clicked
      const newErrors = consoleErrors.slice(errorsBefore)
      if (newErrors.length > 0) {
        console.log(`\n⚠ Console errors on ${tabId} tab:`)
        newErrors.forEach((e) => console.log(`  [${e.type}] ${e.text}`))
      }
    })
  }

  test('Console error summary', async () => {
    console.log('\n' + '='.repeat(60))
    console.log('CONSOLE ERROR SUMMARY')
    console.log('='.repeat(60))
    console.log(`Total console messages: ${consoleLogs.length}`)
    console.log(`Total errors/warnings: ${consoleErrors.length}`)

    if (consoleErrors.length > 0) {
      console.log('\nAll errors and warnings:')
      consoleErrors.forEach((e, i) => {
        console.log(`  ${i + 1}. [${e.type}] ${e.text.substring(0, 200)}`)
      })
    } else {
      console.log('\n✅ No console errors or warnings detected!')
    }
    console.log('='.repeat(60))

    // This test always passes — it's for reporting
    expect(true).toBe(true)
  })
})
