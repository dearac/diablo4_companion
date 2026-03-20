import type { ScanHistoryEntry } from '../../../shared/types'

/**
 * ScansPanel — Displays accumulated compare-mode scan results.
 *
 * Each scanned item appears as a compact card with:
 * - Item name, slot, item power
 * - Color-coded verdict badge (green/amber/red)
 * - Affix match count
 * - Top recommendation
 * - Time since scan
 *
 * Header shows entry count and a "Clear All" button.
 */

interface ScansPanelProps {
  entries: ScanHistoryEntry[]
  onClear: () => void
}

/** Maps verdict to display config */
const VERDICT_CONFIG: Record<string, { color: string; label: string; className: string }> = {
  PERFECT: { color: '#4aaf5a', label: 'PERFECT', className: 'scan-card--perfect' },
  UPGRADE: { color: '#4aaf5a', label: 'UPGRADE', className: 'scan-card--upgrade' },
  SIDEGRADE: { color: '#e8b84a', label: 'SIDEGRADE', className: 'scan-card--sidegrade' },
  DOWNGRADE: { color: '#c41e3a', label: 'DOWNGRADE', className: 'scan-card--downgrade' }
}

/** Format relative time (e.g., "2 min ago") */
function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes === 1) return '1 min ago'
  return `${minutes} min ago`
}

function ScansPanel({ entries, onClear }: ScansPanelProps): React.JSX.Element {
  if (entries.length === 0) {
    return (
      <div className="scans-panel scans-panel--empty" id="scans-panel">
        <div className="scans-panel__empty-msg">
          <span className="scans-panel__empty-icon">🔍</span>
          <span>No scans yet</span>
          <span className="scans-panel__empty-hint">Press F7 in Compare mode to scan an item</span>
        </div>
      </div>
    )
  }

  return (
    <div className="scans-panel" id="scans-panel">
      <div className="scans-panel__header">
        <span className="scans-panel__count">
          {entries.length} item{entries.length !== 1 ? 's' : ''}
        </span>
        <button className="scans-panel__clear" onClick={onClear} title="Clear all scan results">
          🗑️ Clear All
        </button>
      </div>

      <div className="scans-panel__list">
        {entries.map((entry, i) => {
          const v = entry.verdict
          const item = v.scannedItem
          const config = VERDICT_CONFIG[v.verdict] || VERDICT_CONFIG.DOWNGRADE
          const topRec = v.recommendations[0]

          return (
            <div
              key={`${item.slot}-${entry.scannedAt}-${i}`}
              className={`scan-card ${config.className}`}
            >
              {/* Item header */}
              <div className="scan-card__header">
                <span className="scan-card__name">{item.itemName}</span>
                <span className="scan-card__time">{timeAgo(entry.scannedAt)}</span>
              </div>

              <div className="scan-card__meta">
                <span className="scan-card__slot">{item.slot}</span>
                <span className="scan-card__power">{item.itemPower} iP</span>
              </div>

              {/* Verdict badge */}
              <div className="scan-card__verdict" style={{ color: config.color }}>
                <span className="scan-card__verdict-label">{config.label}</span>
                <span className="scan-card__verdict-score">
                  {v.buildMatchCount}/{v.buildTotalExpected} matched
                </span>
              </div>

              {/* Top recommendation */}
              {topRec && (
                <div className="scan-card__rec">
                  <span className="scan-card__rec-icon">
                    {topRec.action === 'enchant' ? '🔧' : topRec.action === 'temper' ? '⚒️' : '💎'}
                  </span>
                  <span className="scan-card__rec-text">
                    {topRec.action === 'enchant' &&
                      `Reroll "${topRec.removeAffix}" → "${topRec.addAffix}"`}
                    {topRec.action === 'temper' && `Temper: ${topRec.addAffix}`}
                    {topRec.action === 'socket' && `Add ${topRec.addAffix}`}
                  </span>
                </div>
              )}

              {/* Greater affixes */}
              {v.greaterAffixCount > 0 && (
                <div className="scan-card__ga">
                  ⭐ {v.greaterAffixCount} Greater Affix{v.greaterAffixCount !== 1 ? 'es' : ''}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default ScansPanel
