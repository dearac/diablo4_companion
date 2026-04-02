import { useState, useCallback, useMemo } from 'react'
import type {
  ScanHistoryEntry,
  RawBuildData,
  ScanVerdict,
  ScannedGearPiece,
  AffixType,
  PerfectibilityResult
} from '../../../shared/types'
import { evaluatePerfectibility } from '../../../shared/PerfectibilityEngine'
import { normalizeSlot } from '../../../shared/SlotNormalizer'
import { affixMatches } from '../../../shared/AffixMatcher'
import AffixTagPopover from './AffixTagPopover'

interface ScansTabProps {
  scanHistory: ScanHistoryEntry[]
  buildData: RawBuildData | null
  latestScanResult: {
    verdict: ScanVerdict | null
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

const PERFECTIBILITY_ICONS: Record<string, string> = {
  PERFECTIBLE: '✨',
  RISKY: '⚠️',
  NOT_PERFECTIBLE: '🚫'
}

const PERFECTIBILITY_LABELS: Record<string, string> = {
  PERFECTIBLE: 'Can Be Perfected',
  RISKY: 'Risky — Needs Work',
  NOT_PERFECTIBLE: 'Not Perfectible'
}

/** Determine match status of an affix against a verdict's matched list. */
function getMatchStatus(affixText: string, matchedAffixes: string[]): 'match' | 'miss' {
  return matchedAffixes.some((m) => affixMatches(affixText, m)) ? 'match' : 'miss'
}

/** Determine AffixType from which sub-array the affix came from. */
function getAffixType(affixText: string, item: ScannedGearPiece): AffixType {
  if (item.greaterAffixes.includes(affixText)) return 'greater'
  if (item.temperedAffixes.includes(affixText)) return 'tempered'
  if (item.implicitAffixes.includes(affixText)) return 'implicit'
  return 'regular'
}

/**
 * Mutate a ScannedGearPiece to move an affix from its current pool to the new type's pool.
 * Returns a new ScannedGearPiece without mutating the original.
 */
function reclassifyAffix(
  item: ScannedGearPiece,
  affixText: string,
  newType: AffixType
): ScannedGearPiece {
  // Remove from all pools
  const filtered = {
    affixes: item.affixes.filter((a) => a !== affixText),
    temperedAffixes: item.temperedAffixes.filter((a) => a !== affixText),
    greaterAffixes: item.greaterAffixes.filter((a) => a !== affixText),
    implicitAffixes: item.implicitAffixes.filter((a) => a !== affixText)
  }

  // Add to new pool
  const updated: ScannedGearPiece = {
    ...item,
    ...filtered
  }

  switch (newType) {
    case 'greater':
      updated.greaterAffixes = [...filtered.greaterAffixes, affixText]
      break
    case 'tempered':
      updated.temperedAffixes = [...filtered.temperedAffixes, affixText]
      break
    case 'implicit':
      updated.implicitAffixes = [...filtered.implicitAffixes, affixText]
      break
    case 'regular':
    default:
      updated.affixes = [...filtered.affixes, affixText]
  }

  return updated
}

function ScansTab({
  scanHistory,
  buildData,
  latestScanResult,
  onClearHistory
}: ScansTabProps): React.JSX.Element {
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null)
  const [localItemData, setLocalItemData] = useState<{ id: number; item: ScannedGearPiece } | null>(
    null
  )

  // Auto-select latest scan result when it drops (Render Phase state update)
  const [prevLatestScan, setPrevLatestScan] = useState(latestScanResult)
  if (latestScanResult !== prevLatestScan) {
    setPrevLatestScan(latestScanResult)
    if (latestScanResult?.verdict && scanHistory.length > 0) {
      setSelectedEntryId(scanHistory[0].scannedAt)
    }
  }

  // Derive selectedEntry directly instead of using an effect
  const selectedEntry =
    scanHistory.find((e) => e.scannedAt === selectedEntryId) ||
    (scanHistory.length > 0 ? scanHistory[0] : null)

  // Derive and reset localItem when selection changes
  if (selectedEntry && selectedEntry.scannedAt !== localItemData?.id) {
    setLocalItemData({
      id: selectedEntry.scannedAt,
      item: { ...selectedEntry.verdict.scannedItem }
    })
  } else if (!selectedEntry && localItemData !== null) {
    setLocalItemData(null)
  }

  const localItem = localItemData?.item || null

  const perfResult = useMemo(() => {
    if (!localItem || !buildData) return null

    const canonical = normalizeSlot(localItem.slot)

    // Find all matching build slots
    const candidateSlots = buildData.gearSlots.filter((gs) => {
      if (canonical === 'Ring') return gs.slot.toLowerCase().startsWith('ring')
      if (canonical === 'Weapon')
        return (
          gs.slot.toLowerCase() === 'weapon' ||
          gs.slot.toLowerCase() === 'slashing weapon' ||
          gs.slot.toLowerCase() === 'bludgeoning weapon' ||
          gs.slot.toLowerCase() === 'dual-wield weapon 1' ||
          gs.slot.toLowerCase() === 'dual-wield weapon 2'
        )
      return gs.slot.toLowerCase() === canonical.toLowerCase()
    })

    if (candidateSlots.length === 0) return null

    let bestEval: PerfectibilityResult | null = null
    let bestScore = -1

    for (const candidate of candidateSlots) {
      const evaluation = evaluatePerfectibility(localItem, candidate)
      // Score based on base affix match count + implicit passed + greater passed
      const score =
        evaluation.steps.baseAffixes.matchCount +
        (evaluation.steps.implicitAffixes.passed ? 100 : 0) +
        (evaluation.steps.baseAffixes.passed ? 10 : 0)

      if (!bestEval || score > bestScore) {
        bestEval = evaluation
        bestScore = score
      }
    }

    return bestEval
  }, [localItem, buildData])

  const handleTagChange = useCallback(
    async (affixText: string, newType: AffixType) => {
      if (!localItem || !selectedEntry) return
      const updated = reclassifyAffix(localItem, affixText, newType)
      setLocalItemData({ id: selectedEntry.scannedAt, item: updated })
      try {
        await window.api.updateScanHistoryEntry(selectedEntry.scannedAt, updated)
      } catch (err) {
        console.error('[ScansTab] Failed to persist tag change:', err)
      }
    },
    [localItem, selectedEntry]
  )

  const renderInboxItem = (entry: ScanHistoryEntry): React.JSX.Element => {
    const v = entry.verdict
    const item = v.scannedItem
    const isSelected = selectedEntry?.scannedAt === entry.scannedAt
    const color = VERDICT_COLORS[v.verdict] || 'var(--text-dim)'

    return (
      <div
        key={entry.scannedAt}
        className={`scan-inbox__item ${isSelected ? 'scan-inbox__item--active' : ''}`}
        onClick={() => setSelectedEntryId(entry.scannedAt)}
      >
        <div className="scan-inbox__item-header">
          <span className="scan-inbox__item-name" style={{ color }}>
            {item.itemName}
          </span>
          <span className="scan-inbox__item-time">{timeAgo(entry.scannedAt)}</span>
        </div>
        <div className="scan-inbox__item-meta">
          <span>{item.slot}</span>
          <span>{item.itemPower} iP</span>
        </div>
        <div className="scan-inbox__item-verdict">
          <span className="badge" style={{ backgroundColor: color }}>
            {v.verdict}
          </span>
          <span className="scan-inbox__item-score">
            {v.buildMatchCount}/{v.buildTotalExpected} MATCH
          </span>
        </div>
      </div>
    )
  }

  const renderDetail = (): React.JSX.Element => {
    if (!selectedEntry || !localItem) {
      return <div className="scan-detail--empty">Select a scan to view details</div>
    }

    const v = selectedEntry.verdict
    const color = VERDICT_COLORS[v.verdict] || 'var(--text-dim)'

    // All affixes for the tag grid
    const allAffixes = [
      ...localItem.implicitAffixes,
      ...localItem.affixes,
      ...localItem.temperedAffixes,
      ...localItem.greaterAffixes
    ]

    // Perfectibility banner class
    const bannerClass = perfResult
      ? `perfectibility-banner--${perfResult.overallVerdict.toLowerCase().replace('_', '-')}`
      : ''

    return (
      <div className="scan-detail">
        {/* ── Header ── */}
        <header className="scan-detail__header">
          <div className="scan-detail__title-group">
            <h2 className="scan-detail__item-name" style={{ color }}>
              {localItem.itemName}
            </h2>
            <div className="scan-detail__badge-group">
              <span className="badge" style={{ backgroundColor: color }}>
                {v.verdict}
              </span>
              {localItem.greaterAffixes.length > 0 && (
                <span className="badge badge--ga">⭐ {localItem.greaterAffixes.length} GA</span>
              )}
            </div>
          </div>
          <p className="scan-detail__item-slot">
            {localItem.slot} · {localItem.itemPower} Item Power · {localItem.itemType}
          </p>
        </header>

        {/* ── Section 1: Perfectibility Banner ── */}
        {perfResult ? (
          <div className={`perfectibility-banner ${bannerClass}`}>
            <span className="perfectibility-banner__icon">
              {PERFECTIBILITY_ICONS[perfResult.overallVerdict]}
            </span>
            <div className="perfectibility-banner__body">
              <span className="perfectibility-banner__verdict">
                {PERFECTIBILITY_LABELS[perfResult.overallVerdict]}
              </span>
              <span className="perfectibility-banner__reason">{perfResult.overallReason}</span>
            </div>
          </div>
        ) : (
          <div className="perfectibility-banner perfectibility-banner--not-perfectible">
            <span className="perfectibility-banner__icon">ℹ️</span>
            <div className="perfectibility-banner__body">
              <span className="perfectibility-banner__verdict">No Build Loaded</span>
              <span className="perfectibility-banner__reason">
                Load a build to see perfectibility analysis.
              </span>
            </div>
          </div>
        )}

        {/* ── Section 2: Clickable Affix Grid ── */}
        <div className="scan-affix-grid">
          <div className="scan-affix-grid__title">Affixes — Click to Reclassify</div>
          {allAffixes.length === 0 && (
            <p style={{ color: 'var(--text-dim)', fontSize: '12px' }}>No affixes detected.</p>
          )}
          {allAffixes.map((affixText, idx) => {
            const currentType = getAffixType(affixText, localItem)
            const matchStatus = getMatchStatus(affixText, v.matchedAffixes)
            return (
              <AffixTagPopover
                key={`${affixText}-${idx}`}
                affixText={affixText}
                currentType={currentType}
                matchStatus={matchStatus}
                onTag={(newType) => handleTagChange(affixText, newType)}
              />
            )
          })}
        </div>

        {/* ── Section 3: Road to Perfect Checklist ── */}
        {perfResult && (
          <div className="road-to-perfect">
            <div className="road-to-perfect__title">Road to Perfect</div>

            {Object.entries(perfResult.steps).map(([key, step]) => {
              const statusIcon = step.skipped ? '⏭️' : step.passed ? '✅' : '🔴'
              return (
                <div
                  key={key}
                  className={`road-to-perfect__step ${step.skipped ? 'road-to-perfect__step--skipped' : ''}`}
                >
                  <span className="road-to-perfect__step-status">{statusIcon}</span>
                  <div className="road-to-perfect__step-body">
                    <span className="road-to-perfect__step-name">{step.name}</span>
                    {!step.skipped && step.action && (
                      <span className="road-to-perfect__step-action">{step.action}</span>
                    )}
                    {step.skipped && (
                      <span className="road-to-perfect__step-action">{step.reason}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="scan-tab" id="scans-tab">
      <div className="scan-inbox">
        <div className="scan-inbox__header">
          <h3>Recent Scans</h3>
          <button className="btn btn--text btn--sm" onClick={onClearHistory}>
            Clear
          </button>
        </div>
        <div className="scan-inbox__list">
          {scanHistory.map(renderInboxItem)}
          {scanHistory.length === 0 && <p className="empty-state">No scans yet.</p>}
        </div>
      </div>
      <div className="scan-detail-view">{renderDetail()}</div>
    </div>
  )
}

export default ScansTab
