import { useState, useEffect, useCallback } from 'react'
import type { ScanHistoryEntry } from '../../../shared/types'

/** Maps verdict to display config */
const VERDICT_CONFIG: Record<string, { color: string; label: string; className: string }> = {
  PERFECT: { color: '#4aaf5a', label: 'PERFECT', className: 'history-card--perfect' },
  UPGRADE: { color: '#4aaf5a', label: 'UPGRADE', className: 'history-card--upgrade' },
  SIDEGRADE: { color: '#e8b84a', label: 'SIDEGRADE', className: 'history-card--sidegrade' },
  DOWNGRADE: { color: '#c41e3a', label: 'DOWNGRADE', className: 'history-card--downgrade' }
}

/** Format relative time */
function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes === 1) return '1 min ago'
  return `${minutes} min ago`
}

/**
 * ScanHistoryTab — Main app tab showing all compare-mode scan results.
 *
 * Fetches scan history on mount. Shows color-coded verdict cards.
 * User can clear all history with a button.
 */
function ScanHistoryTab(): React.JSX.Element {
  const [entries, setEntries] = useState<ScanHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  /** Fetch scan history on mount */
  useEffect(() => {
    window.api
      .getScanHistory()
      .then((history) => {
        setEntries(history)
        setIsLoading(false)
      })
      .catch(() => setIsLoading(false))
  }, [])

  /** Clear all scan history */
  const handleClear = useCallback(async () => {
    await window.api.clearScanHistory()
    setEntries([])
  }, [])

  if (isLoading) {
    return <div className="main-tab-panel main-tab-panel--loading">Loading scan history...</div>
  }

  if (entries.length === 0) {
    return (
      <div className="main-tab-panel main-tab-panel--empty">
        <span className="main-tab-panel__empty-icon">🔍</span>
        <span>No scan results</span>
        <span className="main-tab-panel__empty-hint">
          Scan items with F7 in Compare mode to see results here
        </span>
      </div>
    )
  }

  return (
    <div className="main-tab-panel">
      <div className="main-tab-panel__header">
        <span className="main-tab-panel__title">
          Scan History ({entries.length} item{entries.length !== 1 ? 's' : ''})
        </span>
        <button className="main-tab-panel__clear-btn" onClick={handleClear}>
          🗑️ Clear All
        </button>
      </div>

      <div className="history-list">
        {entries.map((entry, i) => {
          const v = entry.verdict
          const item = v.scannedItem
          const config = VERDICT_CONFIG[v.verdict] || VERDICT_CONFIG.DOWNGRADE

          return (
            <div
              key={`${item.slot}-${entry.scannedAt}-${i}`}
              className={`history-card ${config.className}`}
            >
              <div className="history-card__header">
                <span className="history-card__name">{item.itemName}</span>
                <span className="history-card__time">{timeAgo(entry.scannedAt)}</span>
              </div>

              <div className="history-card__meta">
                <span className="history-card__slot">{item.slot}</span>
                <span className="history-card__power">{item.itemPower} iP</span>
                <span className="history-card__type">{item.itemType}</span>
              </div>

              <div className="history-card__verdict" style={{ color: config.color }}>
                <span className="history-card__verdict-label">{config.label}</span>
                <span className="history-card__verdict-score">
                  {v.buildMatchCount}/{v.buildTotalExpected} matched ({v.buildMatchPercent}%)
                </span>
              </div>

              {/* Affix detail */}
              <div className="history-card__affixes">
                {v.matchedAffixes.map((a, j) => (
                  <span key={j} className="history-card__affix history-card__affix--match">
                    ✅ {a}
                  </span>
                ))}
                {v.missingAffixes.map((a, j) => (
                  <span key={j} className="history-card__affix history-card__affix--miss">
                    ❌ {a}
                  </span>
                ))}
                {v.aspectComparison && (
                  <span
                    className={`history-card__affix ${
                      v.aspectComparison.hasMatch
                        ? 'history-card__affix--match'
                        : 'history-card__affix--miss'
                    }`}
                  >
                    {v.aspectComparison.hasMatch ? '✅' : '❌'} Aspect:{' '}
                    {v.aspectComparison.expectedAspect}
                  </span>
                )}
              </div>

              {/* Recommendations */}
              {v.recommendations.length > 0 && (
                <div className="history-card__recs">
                  {v.recommendations.map((rec, j) => (
                    <div key={j} className="history-card__rec">
                      {rec.action === 'enchant' &&
                        `🔧 Reroll "${rec.removeAffix}" → "${rec.addAffix}"`}
                      {rec.action === 'temper' && `⚒️ Temper: ${rec.addAffix}`}
                      {rec.action === 'socket' && `💎 Add ${rec.addAffix}`}
                      {rec.action === 'aspect' && `🔮 Imprint: ${rec.addAffix}`}
                    </div>
                  ))}
                </div>
              )}

              {/* Greater affixes */}
              {v.greaterAffixCount > 0 && (
                <div className="history-card__ga">
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

export default ScanHistoryTab
