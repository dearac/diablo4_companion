import { useState } from 'react'
import type { BuildAnalysis } from '../../../shared/BuildAnalyzer'

interface BuildAnalysisPanelProps {
  analysis: BuildAnalysis
}

const VERDICT_COLORS: Record<string, string> = {
  PERFECT: 'var(--item-unique)',
  UPGRADE: 'var(--item-legendary)',
  SIDEGRADE: 'var(--item-rare)',
  DOWNGRADE: 'var(--error)',
  EMPTY: 'var(--text-dim)'
}

function BuildAnalysisPanel({ analysis }: BuildAnalysisPanelProps): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false)

  const overallColor =
    analysis.overallPercent >= 100
      ? 'var(--item-unique)'
      : analysis.overallPercent >= 75
        ? 'var(--item-legendary)'
        : analysis.overallPercent >= 50
          ? 'var(--item-rare)'
          : 'var(--error)'

  return (
    <div className="build-analysis">
      <button
        className="build-analysis__header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="build-analysis__headline">
          <span className="build-analysis__label">Build Analysis</span>
          <span className="build-analysis__pct" style={{ color: overallColor }}>
            {analysis.overallPercent}% Complete
          </span>
        </span>
        <span
          className={`build-analysis__chevron ${isExpanded ? 'build-analysis__chevron--open' : ''}`}
        >
          ▾
        </span>
      </button>

      {isExpanded && (
        <div className="build-analysis__body">
          {/* Slot Breakdown */}
          <div className="build-analysis__section">
            <h4 className="build-analysis__section-title">Slot Breakdown</h4>
            {analysis.slotBreakdown.map((slot) => (
              <div key={slot.slot} className="build-analysis__slot">
                <div className="build-analysis__slot-header">
                  <span className="build-analysis__slot-name">{slot.slot}</span>
                  <span
                    className="build-analysis__slot-pct"
                    style={{ color: VERDICT_COLORS[slot.verdict] }}
                  >
                    {slot.verdict === 'EMPTY'
                      ? 'Not scanned'
                      : `${Math.round(slot.matchPercent)}%`}
                  </span>
                </div>
                <div className="build-analysis__slot-bar-track">
                  <div
                    className="build-analysis__slot-bar-fill"
                    style={{
                      width: `${Math.min(100, slot.matchPercent)}%`,
                      backgroundColor: VERDICT_COLORS[slot.verdict]
                    }}
                  />
                </div>
                {slot.topAction && (
                  <div className="build-analysis__slot-hint">
                    {slot.topAction.action === 'enchant'
                      ? '🔧'
                      : slot.topAction.action === 'temper'
                        ? '⚒️'
                        : slot.topAction.action === 'aspect'
                          ? '🔮'
                          : '💎'}{' '}
                    {slot.topAction.action === 'enchant'
                      ? `Reroll "${slot.topAction.removeAffix}" → "${slot.topAction.addAffix}"`
                      : slot.topAction.addAffix}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Global Action Queue */}
          {analysis.globalActionQueue.length > 0 && (
            <div className="build-analysis__section">
              <h4 className="build-analysis__section-title">Priority Actions</h4>
              {analysis.globalActionQueue.slice(0, 10).map((action, i) => (
                <div key={i} className="build-analysis__action">
                  <span className="build-analysis__action-rank">#{i + 1}</span>
                  <span className="build-analysis__action-slot">{action.slot}</span>
                  <span className="build-analysis__action-text">
                    {action.action === 'enchant'
                      ? `Reroll "${action.removeAffix}" → "${action.addAffix}"`
                      : action.addAffix}
                  </span>
                  <span className="build-analysis__action-vendor">{action.vendor}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default BuildAnalysisPanel
