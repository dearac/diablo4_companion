import { useState, useEffect } from 'react'
import type { ScanHistoryEntry, RawBuildData, ScanVerdict, ScannedGearPiece } from '../../../shared/types'

interface ScansTabProps {
  scanHistory: ScanHistoryEntry[]
  buildData: RawBuildData | null
  latestScanResult: {
    mode: string
    verdict: ScanVerdict | null
    equippedItem: ScannedGearPiece | null
    error: string | null
  } | null
  onClearHistory: () => void
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes === 1) return '1 min ago'
  return `${minutes} min ago`
}

const VERDICT_COLORS: Record<string, string> = {
  PERFECT: 'var(--item-unique)',
  UPGRADE: 'var(--item-legendary)',
  SIDEGRADE: 'var(--item-rare)',
  DOWNGRADE: 'var(--error)'
}

function ScansTab({ scanHistory, latestScanResult, onClearHistory }: ScansTabProps): React.JSX.Element {
  const [selectedEntry, setSelectedEntry] = useState<ScanHistoryEntry | null>(null)

  // Auto-select latest scan result when it arrives
  useEffect(() => {
    if (latestScanResult?.verdict) {
      // Find the entry in history (it should be at the top)
      const entry = scanHistory.find(e => e.scannedAt === scanHistory[0]?.scannedAt)
      if (entry) setSelectedEntry(entry)
    }
  }, [latestScanResult, scanHistory])

  // Default selection to first item if none selected
  useEffect(() => {
    if (!selectedEntry && scanHistory.length > 0) {
      setSelectedEntry(scanHistory[0])
    }
  }, [scanHistory, selectedEntry])

  const renderInboxItem = (entry: ScanHistoryEntry): React.JSX.Element => {
    const v = entry.verdict
    const item = v.scannedItem
    const isSelected = selectedEntry?.scannedAt === entry.scannedAt
    const color = VERDICT_COLORS[v.verdict] || 'var(--text-dim)'

    return (
      <div 
        key={entry.scannedAt}
        className={`scan-inbox__item ${isSelected ? 'scan-inbox__item--active' : ''}`}
        onClick={() => setSelectedEntry(entry)}
      >
        <div className="scan-inbox__item-header">
          <span className="scan-inbox__item-name" style={{ color }}>{item.itemName}</span>
          <span className="scan-inbox__item-time">{timeAgo(entry.scannedAt)}</span>
        </div>
        <div className="scan-inbox__item-meta">
          <span>{item.slot}</span>
          <span>{item.itemPower} iP</span>
        </div>
        <div className="scan-inbox__item-verdict">
          <span className="badge" style={{ backgroundColor: color }}>{v.verdict}</span>
          <span className="scan-inbox__item-score">{v.buildMatchCount}/{v.buildTotalExpected} MATCH</span>
        </div>
      </div>
    )
  }

  const renderComparison = (): React.JSX.Element => {
    if (!selectedEntry) return <div className="scan-detail--empty">Select a scan to view details</div>

    const v = selectedEntry.verdict
    const item = v.scannedItem
    const equipped = v.equippedComparison
    const color = VERDICT_COLORS[v.verdict] || 'var(--text-dim)'

    return (
      <div className="scan-detail">
        <header className="scan-detail__header">
          <div className="scan-detail__title-group">
            <h2 className="scan-detail__item-name" style={{ color }}>{item.itemName}</h2>
            <div className="scan-detail__badge-group">
              <span className="badge" style={{ backgroundColor: color }}>{v.verdict}</span>
              {v.greaterAffixCount > 0 && <span className="badge badge--ga">⭐ {v.greaterAffixCount} GA</span>}
            </div>
          </div>
          <p className="scan-detail__item-slot">{item.slot} · {item.itemPower} Item Power · {item.itemType}</p>
        </header>

        <div className="scan-detail__comparison">
          {/* Scanned Item Column */}
          <div className="scan-detail__column">
            <h3 className="scan-detail__column-title">Scanned Item</h3>
            <div className="scan-detail__affix-list">
              {v.matchedAffixes.map(a => (
                <div key={a} className="scan-detail__affix scan-detail__affix--match">
                  <span className="scan-detail__affix-icon">✅</span> {a}
                </div>
              ))}
              {v.missingAffixes.map(a => (
                <div key={a} className="scan-detail__affix scan-detail__affix--miss">
                  <span className="scan-detail__affix-icon">❌</span> {a}
                </div>
              ))}
            </div>
            
            {v.aspectComparison && (
              <div className={`scan-detail__aspect ${v.aspectComparison.hasMatch ? 'scan-detail__aspect--match' : 'scan-detail__aspect--miss'}`}>
                <span className="scan-detail__aspect-icon">{v.aspectComparison.hasMatch ? '✅' : '❌'}</span>
                <span className="scan-detail__aspect-label">Aspect: {v.aspectComparison.expectedAspect}</span>
              </div>
            )}
          </div>

          {/* Equipped Comparison Column */}
          <div className="scan-detail__column scan-detail__column--equipped">
            <h3 className="scan-detail__column-title">Equipped Comparison</h3>
            {equipped ? (
              <div className="scan-detail__equipped-info">
                <div className={`scan-detail__upgrade-badge ${equipped.isUpgrade ? 'scan-detail__upgrade-badge--up' : 'scan-detail__upgrade-badge--down'}`}>
                  {equipped.isUpgrade ? '⬆️ UPGRADE' : '⬇️ DOWNGRADE'}
                </div>
                <div className="scan-detail__equipped-stats">
                  <div className="scan-detail__stat-row">
                    <span>Equipped Score</span>
                    <span>{equipped.equippedMatchCount}/{v.buildTotalExpected}</span>
                  </div>
                  <div className="scan-detail__stat-row">
                    <span>Scanned Score</span>
                    <span>{v.buildMatchCount}/{v.buildTotalExpected}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="scan-detail--empty">No equipped item data found for this slot.</p>
            )}

            {v.recommendations.length > 0 && (
              <div className="scan-detail__recommendations">
                <h4 className="scan-detail__recs-title">Recommendations</h4>
                {v.recommendations.map((rec, i) => (
                  <div key={i} className="scan-detail__rec">
                    <span className="scan-detail__rec-icon">
                      {rec.action === 'enchant' ? '🔧' : rec.action === 'temper' ? '⚒️' : rec.action === 'aspect' ? '🔮' : '💎'}
                    </span>
                    <div className="scan-detail__rec-content">
                      <span className="scan-detail__rec-action">
                        {rec.action === 'enchant' ? 'Reroll' : rec.action === 'temper' ? 'Add' : rec.action === 'aspect' ? 'Imprint' : 'Add Socket'}
                      </span>
                      <span className="scan-detail__rec-text">
                        {rec.action === 'enchant' ? `"${rec.removeAffix}" → "${rec.addAffix}"` : rec.addAffix}
                      </span>
                      <span className="scan-detail__rec-vendor">{rec.vendor}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="scan-tab" id="scans-tab">
      <div className="scan-inbox">
        <div className="scan-inbox__header">
          <h3>Recent Scans</h3>
          <button className="btn btn--text btn--sm" onClick={onClearHistory}>Clear</button>
        </div>
        <div className="scan-inbox__list">
          {scanHistory.map(renderInboxItem)}
          {scanHistory.length === 0 && <p className="empty-state">No scans yet.</p>}
        </div>
      </div>
      <div className="scan-detail-view">
        {renderComparison()}
      </div>
    </div>
  )
}

export default ScansTab
