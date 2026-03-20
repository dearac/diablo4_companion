/**
 * Live OCR Monitor — Long-running Playwright test for Diablo 4 tooltip scanning.
 *
 * Launches the Electron app, loads a build, opens the overlay, then stays
 * alive for up to 30 minutes while you play Diablo 4. Every F7 press
 * triggers the scan pipeline, and this test captures + pretty-prints
 * the full results in real time.
 *
 * Usage:
 *   npx playwright test test/e2e/live-ocr-monitor.spec.ts --reporter=list --timeout=0
 *
 * Kill with Ctrl+C when done.
 */
import { test, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'
import path from 'path'
import fs from 'fs'

const SCANS_DIR = path.join(__dirname, '../../data/scans')

test.describe('Live OCR Monitor', () => {
  let electronApp: ElectronApplication
  let configPage: Page

  // 30-minute timeout — the test stays alive while you play
  test.setTimeout(1_800_000)

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close()
    }
  })

  test('monitor scans in real-time', async () => {
    let scanCount = 0

    // ─────────────────────────────────────────────────
    //  1. Launch the built Electron app
    // ─────────────────────────────────────────────────
    console.log('\n🚀 Launching Electron app...')
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../../out/main/index.js')]
    })

    // Capture ALL main-process console output
    electronApp.on('console', (msg) => {
      const text = msg.text()
      // Always print [SCAN] lines prominently
      if (text.includes('[SCAN]')) {
        console.log(text)
      }
    })

    configPage = await electronApp.firstWindow()
    await configPage.waitForLoadState('domcontentloaded')
    await configPage.waitForTimeout(2000)
    console.log('✅ App launched — config window ready')

    // Capture renderer console as well
    configPage.on('console', (msg) => {
      const text = msg.text()
      if (text.includes('[SCAN]') || msg.type() === 'error') {
        console.log(`[config-renderer] ${text}`)
      }
    })

    // ─────────────────────────────────────────────────
    //  2. Wait for the user to load a build manually
    // ─────────────────────────────────────────────────
    console.log('\n📦 Waiting for you to load a build in the app window...')
    console.log('   (Click a build in the library, or import one via URL)')

    // Poll until .build-summary appears (means a build is loaded)
    const buildSummary = configPage.locator('.build-summary')
    for (let attempt = 1; attempt <= 120; attempt++) {
      const visible = await buildSummary.isVisible().catch(() => false)
      if (visible) break
      if (attempt % 15 === 0) {
        console.log(`   Still waiting for a build... (${attempt * 2}s elapsed)`)
      }
      await configPage.waitForTimeout(2000)
    }
    console.log('✅ Build loaded!')

    // ─────────────────────────────────────────────────
    //  3. Launch the overlay
    // ─────────────────────────────────────────────────
    console.log('\n🖥️  Launching overlay...')
    const launchBtn = configPage.getByRole('button', { name: /launch overlay/i })
    await launchBtn.click()
    await configPage.waitForTimeout(3000)

    const allWindows = electronApp.windows()
    console.log(`   Open windows: ${allWindows.length}`)

    // Find the overlay window (its URL contains overlay.html)
    let overlayPage: Page | null = null
    for (const win of allWindows) {
      const url = win.url()
      if (url.includes('overlay')) {
        overlayPage = win
        break
      }
    }

    if (overlayPage) {
      console.log('✅ Overlay window found')

      // Attach console listener to overlay too
      overlayPage.on('console', (msg) => {
        const text = msg.text()
        if (text.includes('[SCAN]') || text.includes('[MONITOR]')) {
          console.log(`[overlay] ${text}`)
        }
      })

      // ─────────────────────────────────────────────────
      //  4. Hook onScanResult in the overlay
      // ─────────────────────────────────────────────────
      await overlayPage.evaluate(() => {
        let count = 0
        // @ts-expect-error - window.api is defined via preload
        window.api.onScanResult((result: Record<string, unknown>) => {
          count++
          const now = new Date().toLocaleTimeString()
          const separator = '═'.repeat(55)

          console.log(`[MONITOR] ${separator}`)
          console.log(`[MONITOR]   SCAN #${count} — ${now}`)
          console.log(`[MONITOR] ${separator}`)

          if (result.error) {
            console.log(`[MONITOR]   ❌ ERROR: ${result.error}`)
            console.log(`[MONITOR] ${separator}`)
            return
          }

          const verdict = result.verdict as Record<string, unknown> | null
          if (verdict) {
            const item = verdict.scannedItem as Record<string, unknown>
            console.log(`[MONITOR]   ── PARSED ITEM ──`)
            console.log(`[MONITOR]   Name:       ${item.itemName}`)
            console.log(`[MONITOR]   Slot:       ${item.slot}`)
            console.log(`[MONITOR]   Type:       ${item.itemType}`)
            console.log(`[MONITOR]   Item Power: ${item.itemPower}`)
            console.log(
              `[MONITOR]   Affixes:    ${(item.affixes as string[]).length} regular, ${(item.temperedAffixes as string[]).length} tempered, ${(item.greaterAffixes as string[]).length} greater`
            )
            console.log(`[MONITOR]   Sockets:    ${item.sockets}`)

            console.log(`[MONITOR]   ── VERDICT ──`)
            console.log(
              `[MONITOR]   Result:     ${verdict.verdict} (${verdict.buildMatchCount}/${verdict.buildTotalExpected} build affixes matched)`
            )
            console.log(`[MONITOR]   Matched:    ${JSON.stringify(verdict.matchedAffixes)}`)
            console.log(`[MONITOR]   Missing:    ${JSON.stringify(verdict.missingAffixes)}`)

            const eqComp = verdict.equippedComparison as Record<string, unknown> | null
            if (eqComp) {
              const arrow = eqComp.isUpgrade ? '⬆️ UPGRADE' : '⬇️ NOT UPGRADE'
              console.log(
                `[MONITOR]   vs Equipped: ${arrow} (equipped: ${eqComp.equippedMatchCount}/${verdict.buildTotalExpected})`
              )
            }

            const recs = verdict.recommendations as Array<Record<string, unknown>>
            if (recs && recs.length > 0) {
              recs.forEach((rec) => {
                const remove = rec.removeAffix ? `Reroll "${rec.removeAffix}" → ` : ''
                console.log(
                  `[MONITOR]   Rec:        ${(rec.action as string).toUpperCase()}: ${remove}"${rec.addAffix}" (${rec.vendor})`
                )
              })
            }
          }

          if (result.equippedItem) {
            const eq = result.equippedItem as Record<string, unknown>
            console.log(`[MONITOR]   ── EQUIPPED ──`)
            console.log(`[MONITOR]   Stored: ${eq.itemName} → ${eq.slot}`)
          }

          console.log(`[MONITOR] ${separator}`)
        })
      })
      console.log('✅ Scan result listener hooked in overlay')
    } else {
      console.log(
        '⚠️  Could not find overlay window — scan results will only show in main process logs'
      )
    }

    // ─────────────────────────────────────────────────
    //  5. Record initial scan file count
    // ─────────────────────────────────────────────────
    const knownScanFiles = new Set<string>()
    if (fs.existsSync(SCANS_DIR)) {
      fs.readdirSync(SCANS_DIR)
        .filter((f) => f.startsWith('scan-'))
        .forEach((f) => knownScanFiles.add(f))
    }
    console.log(`\n📂 Existing scan files: ${knownScanFiles.size}`)

    // ─────────────────────────────────────────────────
    //  6. Enter the monitoring loop
    // ─────────────────────────────────────────────────
    console.log('\n' + '═'.repeat(55))
    console.log('  🎮 LIVE MONITOR ACTIVE — Press F7 in Diablo 4 to scan')
    console.log('  🛑 Press Ctrl+C in this terminal to stop')
    console.log('═'.repeat(55) + '\n')

    // Poll for new scan files and keep the test alive
    const startTime = Date.now()
    const maxRuntime = 30 * 60 * 1000 // 30 minutes

    try {
      while (Date.now() - startTime < maxRuntime) {
        await configPage.waitForTimeout(2000)

        // Check for new scan files
        if (fs.existsSync(SCANS_DIR)) {
          const currentFiles = fs.readdirSync(SCANS_DIR).filter((f) => f.startsWith('scan-'))
          for (const file of currentFiles) {
            if (!knownScanFiles.has(file)) {
              knownScanFiles.add(file)
              scanCount++
              const filePath = path.join(SCANS_DIR, file)
              const stats = fs.statSync(filePath)
              const sizeMB = (stats.size / (1024 * 1024)).toFixed(1)
              console.log(
                `\n📸 [Scan #${scanCount}] New screenshot: ${file} (${sizeMB} MB) — ${new Date().toLocaleTimeString()}`
              )
            }
          }
        }
      }

      console.log('\n⏰ 30-minute timeout reached — shutting down.')
    } catch {
      // Page disconnected (user closed the app or Ctrl+C) — exit gracefully
      console.log('\n🛑 App disconnected — monitor stopped.')
    }
  })
})
