/**
 * Live Compare Accuracy Audit — Watches scan-history.json for new scans.
 *
 * Works alongside the running Electron app (npm run dev) with ZERO
 * conflicts — simply polls the scan history file for new entries.
 *
 * Prerequisites:
 *   1. Run `npm run dev` — the app must already be running
 *   2. Load a build in the app (from library or import)
 *
 * Usage:
 *   npx playwright test test/e2e/live-compare-audit.spec.ts --reporter=list --timeout=0
 *
 * Kill with Ctrl+C when done playing — reports are generated on exit.
 */
import { test } from '@playwright/test'
import path from 'path'
import fs from 'fs'

// ─── Types (mirrors shared/types.ts ScanVerdict + ScanHistoryEntry) ─────────

interface ScanHistoryEntry {
  verdict: {
    scannedItem: {
      slot: string
      itemName: string
      itemType: string
      itemPower: number
      affixes: string[]
      implicitAffixes: string[]
      temperedAffixes: string[]
      greaterAffixes: string[]
      sockets: number
      socketContents: string[]
      aspect: { name: string; description: string } | null
      rawText: string
    }
    buildMatchCount: number
    buildTotalExpected: number
    buildMatchPercent: number
    matchedAffixes: string[]
    missingAffixes: string[]
    extraAffixes: string[]
    socketDelta: number
    greaterAffixCount: number
    verdict: 'PERFECT' | 'UPGRADE' | 'SIDEGRADE' | 'DOWNGRADE'
    equippedComparison: {
      equippedMatchCount: number
      isUpgrade: boolean
    } | null
    aspectComparison: {
      expectedAspect: string
      hasMatch: boolean
    } | null
    recommendations: Array<{
      action: string
      removeAffix: string | null
      addAffix: string
      vendor: string
      resultScore: string
    }>
  }
  scannedAt: number
}

interface AuditReport {
  generatedAt: string
  sessionDurationMinutes: number
  totalScans: number
  successfulScans: number
  verdictBreakdown: Record<string, number>
  averageMatchPercent: number
  aspectMatchRate: number
  upgradeCount: number
  scans: ScanHistoryEntry[]
}

// ─── Paths ──────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, '../../data')
const SCAN_HISTORY_FILE = path.join(DATA_DIR, 'scan-history.json')
const REPORT_DIR = path.join(__dirname, '../../test-results/compare-audit')

// ─── Helpers ────────────────────────────────────────────────────────────────

function readScanHistory(): ScanHistoryEntry[] {
  if (!fs.existsSync(SCAN_HISTORY_FILE)) return []
  try {
    return JSON.parse(fs.readFileSync(SCAN_HISTORY_FILE, 'utf-8'))
  } catch {
    return []
  }
}

function verdictEmoji(v: string): string {
  switch (v) {
    case 'PERFECT':
      return '🟢'
    case 'UPGRADE':
      return '🔵'
    case 'SIDEGRADE':
      return '🟡'
    default:
      return '🔴'
  }
}

function generateMarkdownReport(report: AuditReport): string {
  const lines: string[] = []

  lines.push('# 🎯 Compare Accuracy Audit Report')
  lines.push('')
  lines.push(`**Generated:** ${report.generatedAt}`)
  lines.push(`**Session Duration:** ${report.sessionDurationMinutes.toFixed(1)} minutes`)
  lines.push('')

  // ── Summary ──
  lines.push('## 📊 Summary')
  lines.push('')
  lines.push('| Metric | Value |')
  lines.push('|--------|-------|')
  lines.push(`| Total Scans | ${report.totalScans} |`)
  lines.push(`| Avg Match % | ${report.averageMatchPercent.toFixed(1)}% |`)
  lines.push(`| Aspect Match Rate | ${(report.aspectMatchRate * 100).toFixed(0)}% |`)
  lines.push(`| Upgrades Detected | ${report.upgradeCount} |`)
  lines.push('')

  // ── Verdict Distribution ──
  if (Object.keys(report.verdictBreakdown).length > 0) {
    lines.push('## 📈 Verdict Distribution')
    lines.push('')
    lines.push('| Verdict | Count |')
    lines.push('|---------|-------|')
    for (const [verdict, count] of Object.entries(report.verdictBreakdown)) {
      lines.push(`| ${verdictEmoji(verdict)} ${verdict} | ${count} |`)
    }
    lines.push('')
  }

  // ── Per-Scan Details ──
  lines.push('## 🔍 Scan Details')
  lines.push('')

  for (let i = 0; i < report.scans.length; i++) {
    const entry = report.scans[i]
    const v = entry.verdict
    const item = v.scannedItem
    const scanTime = new Date(entry.scannedAt).toLocaleString()

    lines.push(`### ${verdictEmoji(v.verdict)} Scan #${i + 1} — ${scanTime}`)
    lines.push('')

    // Item info
    lines.push('#### Parsed Item')
    lines.push('')
    lines.push('| Field | Value |')
    lines.push('|-------|-------|')
    lines.push(`| Name | ${item.itemName} |`)
    lines.push(`| Slot | ${item.slot} |`)
    lines.push(`| Type | ${item.itemType} |`)
    lines.push(`| Item Power | ${item.itemPower} |`)
    lines.push(`| Sockets | ${item.sockets} |`)
    lines.push(`| Regular Affixes | ${item.affixes.length > 0 ? item.affixes.join(', ') : '—'} |`)
    lines.push(
      `| Tempered Affixes | ${item.temperedAffixes.length > 0 ? item.temperedAffixes.join(', ') : '—'} |`
    )
    lines.push(
      `| Greater Affixes | ${item.greaterAffixes.length > 0 ? item.greaterAffixes.join(', ') : '—'} |`
    )
    if (item.aspect) {
      lines.push(`| Aspect | ${item.aspect.name} |`)
    }
    lines.push('')

    // Verdict
    lines.push('#### Verdict')
    lines.push('')
    lines.push('| Field | Value |')
    lines.push('|-------|-------|')
    lines.push(`| Rating | **${v.verdict}** |`)
    lines.push(
      `| Build Match | ${v.buildMatchCount} / ${v.buildTotalExpected} (${v.buildMatchPercent}%) |`
    )
    lines.push(`| Matched | ${v.matchedAffixes.length > 0 ? v.matchedAffixes.join(', ') : '—'} |`)
    lines.push(`| Missing | ${v.missingAffixes.length > 0 ? v.missingAffixes.join(', ') : '—'} |`)
    lines.push(`| Extra | ${v.extraAffixes.length > 0 ? v.extraAffixes.join(', ') : '—'} |`)
    lines.push(`| Socket Delta | ${v.socketDelta} |`)
    lines.push(`| Greater Affixes | ${v.greaterAffixCount} |`)
    lines.push('')

    if (v.equippedComparison) {
      lines.push('#### vs Equipped')
      lines.push('')
      lines.push(`- **Is Upgrade:** ${v.equippedComparison.isUpgrade ? '⬆️ YES' : '⬇️ NO'}`)
      lines.push(`- **Equipped Match Count:** ${v.equippedComparison.equippedMatchCount}`)
      lines.push('')
    }

    if (v.aspectComparison) {
      lines.push('#### Aspect Comparison')
      lines.push('')
      lines.push(`- **Expected:** ${v.aspectComparison.expectedAspect}`)
      lines.push(`- **Has Match:** ${v.aspectComparison.hasMatch ? '✅' : '❌'}`)
      lines.push('')
    }

    if (v.recommendations.length > 0) {
      lines.push('#### Crafting Recommendations')
      lines.push('')
      lines.push('| Action | Remove | Add | Vendor | Note |')
      lines.push('|--------|--------|-----|--------|------|')
      for (const rec of v.recommendations) {
        lines.push(
          `| ${rec.action.toUpperCase()} | ${rec.removeAffix ?? '—'} | ${rec.addAffix} | ${rec.vendor} | ${rec.resultScore} |`
        )
      }
      lines.push('')
    }

    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}

// ─── Test ───────────────────────────────────────────────────────────────────

test.describe('Live Compare Accuracy Audit', () => {
  // 30-minute timeout — the test stays alive while you play
  test.setTimeout(1_800_000)

  test('audit compare accuracy across live scans', async () => {
    const startTime = Date.now()
    let newScanCount = 0
    const newScans: ScanHistoryEntry[] = []
    let reportWritten = false

    // ── Report generation function (called on exit OR Ctrl+C) ──
    function writeReport(): void {
      if (reportWritten) return
      reportWritten = true

      const sessionDuration = (Date.now() - startTime) / 1000 / 60
      const sortedScans = [...newScans].sort((a, b) => a.scannedAt - b.scannedAt)

      const verdictBreakdown: Record<string, number> = {}
      for (const scan of sortedScans) {
        const v = scan.verdict.verdict
        verdictBreakdown[v] = (verdictBreakdown[v] || 0) + 1
      }

      const avgMatchPercent =
        sortedScans.length > 0
          ? sortedScans.reduce((sum, s) => sum + s.verdict.buildMatchPercent, 0) /
            sortedScans.length
          : 0

      const aspectScans = sortedScans.filter((s) => s.verdict.aspectComparison)
      const aspectMatchRate =
        aspectScans.length > 0
          ? aspectScans.filter((s) => s.verdict.aspectComparison?.hasMatch).length /
            aspectScans.length
          : 0

      const upgradeCount = sortedScans.filter((s) => s.verdict.equippedComparison?.isUpgrade).length

      const report: AuditReport = {
        generatedAt: new Date().toISOString(),
        sessionDurationMinutes: sessionDuration,
        totalScans: sortedScans.length,
        successfulScans: sortedScans.length,
        verdictBreakdown,
        averageMatchPercent: avgMatchPercent,
        aspectMatchRate,
        upgradeCount,
        scans: sortedScans
      }

      fs.mkdirSync(REPORT_DIR, { recursive: true })

      const jsonPath = path.join(REPORT_DIR, 'compare-audit-report.json')
      fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8')

      const mdPath = path.join(REPORT_DIR, 'compare-audit-report.md')
      fs.writeFileSync(mdPath, generateMarkdownReport(report), 'utf-8')

      console.log('\n' + '═'.repeat(60))
      console.log('  📊 AUDIT COMPLETE')
      console.log('═'.repeat(60))
      console.log(`  📄 JSON:  ${jsonPath}`)
      console.log(`  📄 MD:    ${mdPath}`)
      console.log(`  Total Scans:      ${report.totalScans}`)
      console.log(`  Avg Match %:      ${report.averageMatchPercent.toFixed(1)}%`)
      console.log(`  Upgrades Found:   ${report.upgradeCount}`)
      console.log(`  Session Duration: ${report.sessionDurationMinutes.toFixed(1)} min`)
      for (const [v, count] of Object.entries(verdictBreakdown)) {
        console.log(`  ${verdictEmoji(v)} ${v}: ${count}`)
      }
      console.log('═'.repeat(60) + '\n')
    }

    // ── Register SIGINT (Ctrl+C) handler ──
    const sigintHandler = (): void => {
      console.log('\n🛑 Ctrl+C received — generating report...')
      writeReport()
      process.exit(0)
    }
    process.on('SIGINT', sigintHandler)

    // ─────────────────────────────────────────────────
    //  1. Snapshot the current scan history
    // ─────────────────────────────────────────────────
    console.log('\n📂 Reading current scan history...')
    const baselineScans = readScanHistory()
    const baselineIds = new Set(baselineScans.map((e) => e.scannedAt))
    console.log(`   Found ${baselineScans.length} existing entries (will ignore these)`)

    console.log('\n' + '═'.repeat(60))
    console.log('  🎯 COMPARE ACCURACY AUDIT ACTIVE')
    console.log('  📱 Keep the app running (npm run dev)')
    console.log('  🎮 Press F7 in Diablo 4 to scan items')
    console.log('  🛑 Press Ctrl+C here when done → report generated')
    console.log('═'.repeat(60) + '\n')

    const maxRuntime = 30 * 60 * 1000

    // ─────────────────────────────────────────────────
    //  2. Poll scan-history.json for new entries
    // ─────────────────────────────────────────────────
    try {
      while (Date.now() - startTime < maxRuntime) {
        await new Promise((resolve) => setTimeout(resolve, 1500))

        const current = readScanHistory()

        for (const entry of current) {
          if (!baselineIds.has(entry.scannedAt)) {
            baselineIds.add(entry.scannedAt)
            newScanCount++
            newScans.push(entry)

            const v = entry.verdict
            const item = v.scannedItem
            const emoji = verdictEmoji(v.verdict)

            console.log(
              `${emoji} SCAN #${newScanCount}: ${item.itemName} [${item.slot}] — ${v.verdict} (${v.buildMatchCount}/${v.buildTotalExpected} = ${v.buildMatchPercent}%)`
            )

            if (v.matchedAffixes.length > 0) {
              console.log(`   ✅ Matched: ${v.matchedAffixes.join(', ')}`)
            }
            if (v.missingAffixes.length > 0) {
              console.log(`   ❌ Missing: ${v.missingAffixes.join(', ')}`)
            }
            if (v.extraAffixes.length > 0) {
              console.log(`   ➕ Extra:   ${v.extraAffixes.join(', ')}`)
            }
            if (v.equippedComparison) {
              console.log(
                `   ${v.equippedComparison.isUpgrade ? '⬆️  UPGRADE over equipped' : '⬇️  NOT an upgrade'} (equipped: ${v.equippedComparison.equippedMatchCount}/${v.buildTotalExpected})`
              )
            }
            if (v.aspectComparison) {
              console.log(
                `   🔮 Aspect: ${v.aspectComparison.hasMatch ? '✅' : '❌'} ${v.aspectComparison.expectedAspect}`
              )
            }
            if (v.recommendations.length > 0) {
              for (const rec of v.recommendations) {
                const remove = rec.removeAffix ? `Reroll "${rec.removeAffix}" → ` : ''
                console.log(
                  `   🔧 ${rec.action.toUpperCase()}: ${remove}"${rec.addAffix}" (${rec.vendor})`
                )
              }
            }
            console.log('')
          }
        }
      }
      console.log('\n⏰ 30-minute timeout reached')
    } catch {
      // Interrupted
    }

    // ─────────────────────────────────────────────────
    //  3. Generate report (normal exit)
    // ─────────────────────────────────────────────────
    writeReport()
    process.removeListener('SIGINT', sigintHandler)
  })
})
