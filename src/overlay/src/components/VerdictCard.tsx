import { useEffect, useState } from 'react'
import type { ScanVerdict } from '../../../shared/types'
import { DebugOcrBox } from './DebugOcrBox'

/**
 * VerdictCard — Displays scan results as a slide-in card.
 *
 * Shows affix match results, verdict badge,
 * crafting recommendations against the loaded build.
 *
 * Auto-dismisses after 10 seconds.
 */

interface VerdictCardProps {
  result: {
    verdict: ScanVerdict | null
    error: string | null
  } | null
  onDismiss: () => void
}

/** Maps verdict strings to display colors and emoji */
const VERDICT_STYLES: Record<string, { emoji: string; className: string }> = {
  PERFECT: { emoji: '🟢', className: 'verdict-card__badge--perfect' },
  UPGRADE: { emoji: '🟢', className: 'verdict-card__badge--upgrade' },
  SIDEGRADE: { emoji: '🟡', className: 'verdict-card__badge--sidegrade' },
  DOWNGRADE: { emoji: '🔴', className: 'verdict-card__badge--downgrade' }
}

function VerdictCard({ result, onDismiss }: VerdictCardProps): React.JSX.Element | null {
  const [isVisible, setIsVisible] = useState(false)
  const [debugMode, setDebugMode] = useState(false)

  /** Slide in when result arrives */
  useEffect(() => {
    if (!result) {
      setIsVisible(false)
      return
    }

    // Trigger entrance animation
    const showTimeout = setTimeout(() => setIsVisible(true), 50)

    // Keep it up for 60 seconds (basically staying on the gear)
    const dismissTimeout = setTimeout(() => {
      setIsVisible(false)
      setTimeout(onDismiss, 300) // Wait for exit animation
    }, 60000)

    return (): void => {
      clearTimeout(showTimeout)
      clearTimeout(dismissTimeout)
    }
  }, [result, onDismiss])

  useEffect(() => {
    if (window.api.getDebugMode) {
      window.api.getDebugMode().then(setDebugMode)
    }
  }, [result])

  if (!result) return null

  /** Handle manual dismiss */
  const handleDismiss = (): void => {
    setIsVisible(false)
    setTimeout(onDismiss, 300)
  }

  // ---- Error state ----
  if (result.error) {
    return (
      <div
        className={`verdict-card verdict-card--error ${isVisible ? 'verdict-card--visible' : ''}`}
        id="verdict-card"
      >
        <div className="verdict-card__header">
          <span className="verdict-card__error-icon">⚠️</span>
          <span className="verdict-card__error-text">{result.error}</span>
        </div>
        <button className="verdict-card__dismiss" onClick={handleDismiss}>
          ✕
        </button>
      </div>
    )
  }

  // ---- Compare verdict ----
  const verdict = result.verdict
  if (!verdict) return null

  const style = VERDICT_STYLES[verdict.verdict] || VERDICT_STYLES.DOWNGRADE
  const item = verdict.scannedItem

  return (
    <div
      className={`verdict-card verdict-card--compare ${isVisible ? 'verdict-card--visible' : ''}`}
      id="verdict-card"
      onMouseEnter={() => window.api.setIgnoreMouseEvents(false)}
      onMouseLeave={() => window.api.setIgnoreMouseEvents(true, { forward: true })}
    >
      {debugMode && <DebugOcrBox rawText={verdict.scannedItem.rawText || ''} />}
      {/* Dismiss button */}
      <button className="verdict-card__dismiss" onClick={handleDismiss}>
        ✕
      </button>

      {/* Item header */}
      <div className="verdict-card__item-header">
        <span className="verdict-card__item-name">{item.itemName}</span>
        <span className="verdict-card__item-slot">({item.slot})</span>
      </div>
      <div className="verdict-card__item-power">{item.itemPower} Item Power</div>

      {/* Verdict badge */}
      <div className={`verdict-card__badge ${style.className}`}>
        <span>{style.emoji}</span>
        <span>{verdict.verdict}</span>
        <span className="verdict-card__badge-score">
          — {verdict.buildMatchCount}/{verdict.buildTotalExpected} build affixes matched
        </span>
      </div>

      {/* Affix match list */}
      <div className="verdict-card__affixes">
        {verdict.matchedAffixes.map((affix) => (
          <div key={affix} className="verdict-card__affix verdict-card__affix--matched">
            <span className="verdict-card__affix-icon">✅</span>
            <span>{affix}</span>
          </div>
        ))}
        {verdict.missingAffixes.map((affix) => (
          <div key={affix} className="verdict-card__affix verdict-card__affix--missing">
            <span className="verdict-card__affix-icon">❌</span>
            <span>Missing: {affix}</span>
          </div>
        ))}
        {verdict.aspectComparison && (
          <div
            className={`verdict-card__affix ${verdict.aspectComparison.hasMatch
              ? 'verdict-card__affix--matched'
              : 'verdict-card__affix--missing'
              }`}
          >
            <span className="verdict-card__affix-icon">
              {verdict.aspectComparison.hasMatch ? '✅' : '❌'}
            </span>
            <span>Aspect: {verdict.aspectComparison.expectedAspect}</span>
          </div>
        )}
      </div>

      {/* Socket info */}
      {verdict.socketDelta !== 0 && (
        <div className="verdict-card__sockets">
          💎 Sockets: {verdict.scannedItem.sockets}/
          {verdict.scannedItem.sockets - verdict.socketDelta}
          {verdict.socketDelta < 0 && (
            <span className="verdict-card__socket-action">
              {' '}
              — Visit Jeweler for +{Math.abs(verdict.socketDelta)}
            </span>
          )}
        </div>
      )}

      {/* Greater affixes */}
      {verdict.greaterAffixCount > 0 && (
        <div className="verdict-card__greater">⭐ Greater Affixes: {verdict.greaterAffixCount}</div>
      )}

      {/* Recommendations */}
      {verdict.recommendations.length > 0 && (
        <div className="verdict-card__recommendations">
          {verdict.recommendations.map((rec, i) => (
            <div key={i} className="verdict-card__rec">
              <span className="verdict-card__rec-icon">
                {rec.action === 'enchant'
                  ? '🔧'
                  : rec.action === 'temper'
                    ? '⚒️'
                    : rec.action === 'aspect'
                      ? '🔮'
                      : '💎'}
              </span>
              <span className="verdict-card__rec-text">
                {rec.action === 'enchant' && (
                  <>
                    <strong>ENCHANT:</strong> Reroll &quot;{rec.removeAffix}&quot; at {rec.vendor} →
                    try for &quot;{rec.addAffix}&quot;
                  </>
                )}
                {rec.action === 'temper' && (
                  <>
                    <strong>TEMPER:</strong> Add &quot;{rec.addAffix}&quot; at {rec.vendor}
                  </>
                )}
                {rec.action === 'socket' && (
                  <>
                    <strong>SOCKET:</strong> Visit {rec.vendor} to add {rec.addAffix}
                  </>
                )}
                {rec.action === 'aspect' && (
                  <>
                    <strong>IMPRINT:</strong> Get &quot;{rec.addAffix}&quot; at {rec.vendor}
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default VerdictCard
