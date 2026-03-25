import { useState, useEffect } from 'react'
import type { ScannedGearPiece, RawBuildData, IGearSlot } from '../../../shared/types'
import { affixMatches } from '../../../shared/AffixMatcher'

import { computeBuildAnalysis } from '../../../shared/BuildAnalyzer'
import AffixEditor from './AffixEditor'
import BuildAnalysisPanel from './BuildAnalysisPanel'

interface EquippedGearTabProps {
  buildData: RawBuildData | null
}

/** Slot display order */
const SLOT_ORDER = [
  'Helm',
  'Chest Armor',
  'Gloves',
  'Pants',
  'Boots',
  'Amulet',
  'Ring 1',
  'Ring 2',
  'Weapon',
  'Offhand'
]

/** Status label + class for a given match percentage */
function getStatus(pct: number): { label: string; icon: string; cls: string } {
  if (pct >= 100) return { label: 'PERFECT', icon: '✅', cls: 'perfect' }
  if (pct >= 75) return { label: 'GOOD', icon: '🟢', cls: 'good' }
  if (pct >= 50) return { label: 'NEEDS WORK', icon: '🟡', cls: 'fair' }
  return { label: 'POOR', icon: '🔴', cls: 'poor' }
}

/**
 * EquippedGearTab — Main app tab with compact gear cards and hover tooltips.
 */
function EquippedGearTab({ buildData }: EquippedGearTabProps): React.JSX.Element {
  const [equippedGear, setEquippedGear] = useState<Record<string, ScannedGearPiece>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [editingSlot, setEditingSlot] = useState<string | null>(null)

  useEffect(() => {
    window.api
      .getEquippedGear()
      .then((gear) => {
        setEquippedGear(gear)
        setIsLoading(false)
      })
      .catch(() => setIsLoading(false))
  }, [])

  const handleClearAll = (): void => {
    window.api.clearEquippedGear().then(() => {
      setEquippedGear({})
    })
  }

  if (isLoading) {
    return <div className="main-tab-panel main-tab-panel--loading">Loading equipped gear...</div>
  }

  const slotNames = SLOT_ORDER.filter(
    (s) => equippedGear[s] || buildData?.gearSlots.some((gs) => gs.slot === s)
  )

  if (slotNames.length === 0) {
    return (
      <div className="main-tab-panel main-tab-panel--empty">
        <span className="main-tab-panel__empty-icon">🛡️</span>
        <span>No equipped gear scanned yet</span>
        <span className="main-tab-panel__empty-hint">
          Switch to Equip mode (F8) and scan each gear slot (F7)
        </span>
      </div>
    )
  }

  return (
    <div className="main-tab-panel">
      <div className="main-tab-panel__header">
        <span className="main-tab-panel__title">Equipped Gear</span>
        <button className="main-tab-panel__clear-btn" onClick={handleClearAll}>
          🗑️ Clear All
        </button>
      </div>

      {buildData && Object.keys(equippedGear).length > 0 && (
        <BuildAnalysisPanel
          analysis={computeBuildAnalysis(equippedGear, buildData.gearSlots)}
        />
      )}

      <div className="equipped-grid">
        {slotNames.map((slotName) => {
          const equipped = equippedGear[slotName] ?? null
          const buildSlot: IGearSlot | undefined = buildData?.gearSlots.find(
            (gs) => gs.slot === slotName
          )

          // Compare affixes
          const matched: string[] = []
          const missing: string[] = []
          if (equipped && buildSlot) {
            const allBuildAffixes = [
              ...new Set([
                ...buildSlot.affixes.map((a) => a.name),
                ...buildSlot.temperedAffixes.map((a) => a.name),
                ...buildSlot.greaterAffixes.map((a) => a.name)
              ])
            ]
            const allEquippedAffixes = [
              ...equipped.affixes,
              ...equipped.temperedAffixes,
              ...equipped.greaterAffixes
            ]
            for (const ba of allBuildAffixes) {
              if (allEquippedAffixes.some((ea) => affixMatches(ea, ba))) matched.push(ba)
              else missing.push(ba)
            }
          }

          // Aspect check
          const expectedAspect = buildSlot?.requiredAspect?.name ?? null
          const equippedAspect = equipped?.aspect?.name ?? null
          let aspectMatch = true
          if (expectedAspect && equippedAspect) {
            aspectMatch =
              equippedAspect.toLowerCase().includes(expectedAspect.toLowerCase()) ||
              expectedAspect.toLowerCase().includes(equippedAspect.toLowerCase())
          } else if (expectedAspect && !equippedAspect) {
            aspectMatch = false
          }

          const total = matched.length + missing.length
          const pct = total > 0 ? Math.round((matched.length / total) * 100) : 0

          if (!equipped) {
            return (
              <div key={slotName} className="equipped-slot-card equipped-slot-card--empty">
                <div className="equipped-slot-card__header">
                  <span className="equipped-slot-card__slot">{slotName}</span>
                </div>
                <div className="equipped-slot-card__empty-text">Not scanned</div>
              </div>
            )
          }

          const status = getStatus(pct)

          // Tempered check
          const buildTemperedNames = buildSlot
            ? [...new Set(buildSlot.temperedAffixes.map((a) => a.name))]
            : []
          const allEq = [
            ...equipped.affixes,
            ...equipped.temperedAffixes,
            ...equipped.greaterAffixes
          ]
          const missingTempers = buildTemperedNames.filter(
            (bt) => !allEq.some((ea) => affixMatches(ea, bt))
          )

          // Build action list
          const actions: { icon: string; vendor: string; text: string }[] = []
          if (missing.length > 0) {
            actions.push({ icon: '🔧', vendor: 'Occultist', text: `Reroll → ${missing[0]}` })
          }
          for (const mt of missingTempers) {
            actions.push({ icon: '⚒️', vendor: 'Blacksmith', text: `Temper: ${mt}` })
          }
          if (!aspectMatch && expectedAspect) {
            actions.push({ icon: '🔮', vendor: 'Occultist', text: `Imprint: ${expectedAspect}` })
          }
          if (matched.length > 0) {
            actions.push({
              icon: '⭐',
              vendor: 'Blacksmith',
              text: `Masterwork: ${matched[0]}`
            })
          }

          const needsWork = missing.length > 0 || missingTempers.length > 0 || !aspectMatch

          return (
            <div key={slotName} className={`equipped-slot-card equipped-slot-card--${status.cls}`}>
              <div className="equipped-slot-card__header">
                <span className="equipped-slot-card__slot">{slotName}</span>
                <span className={`equipped-slot-card__pct equipped-slot-card__pct--${status.cls}`}>
                  {status.icon} {pct}%
                </span>
              </div>

              <div className="equipped-slot-card__item">
                {equipped.itemName} · {equipped.itemPower} iP
              </div>

              {needsWork && actions.length > 0 && (
                <div className="equipped-slot-card__action-hint">
                  {actions[0].icon} {actions[0].text}
                  {actions.length > 1 && ` +${actions.length - 1} more`}
                </div>
              )}
              {!needsWork && (
                <div className="equipped-slot-card__action-hint equipped-slot-card__action-hint--good">
                  ✅ Build match — Masterwork {matched[0]}
                </div>
              )}

              {/* Hover tooltip */}
              <div className="gear-tooltip">
                <div className="gear-tooltip__header">
                  <span className={`gear-tooltip__status gear-tooltip__status--${status.cls}`}>
                    {status.icon} {status.label}
                  </span>
                  <span className="gear-tooltip__score">
                    {matched.length}/{total} affixes
                  </span>
                </div>

                <div className="gear-tooltip__divider" />

                <div className="gear-tooltip__section">Affixes</div>
                {matched.map((a, i) => (
                  <div key={`m${i}`} className="gear-tooltip__affix gear-tooltip__affix--match">
                    ✅ {a}
                  </div>
                ))}
                {missing.map((a, i) => (
                  <div key={`x${i}`} className="gear-tooltip__affix gear-tooltip__affix--miss">
                    ❌ {a}
                  </div>
                ))}

                {expectedAspect && (
                  <div
                    className={`gear-tooltip__affix gear-tooltip__affix--${aspectMatch ? 'match' : 'miss'}`}
                  >
                    {aspectMatch ? '✅' : '❌'} Aspect: {expectedAspect}
                  </div>
                )}

                {actions.length > 0 && (
                  <>
                    <div className="gear-tooltip__divider" />
                    <div className="gear-tooltip__section">Actions</div>
                    {actions.map((act, i) => (
                      <div key={i} className="gear-tooltip__action">
                        <span className="gear-tooltip__action-icon">{act.icon}</span>
                        <span className="gear-tooltip__action-text">{act.text}</span>
                        <span className="gear-tooltip__action-vendor">{act.vendor}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>

              <button
                className="btn btn--outline btn--sm"
                onClick={() =>
                  setEditingSlot(editingSlot === slotName ? null : slotName)
                }
                style={{ marginTop: '6px', alignSelf: 'flex-start' }}
              >
                {editingSlot === slotName ? 'Close' : '✏️ Edit'}
              </button>

              {editingSlot === slotName && (
                <AffixEditor
                  item={equipped}
                  buildSlot={buildSlot ?? null}
                  onSave={(updated) => {
                    setEquippedGear((prev) => ({ ...prev, [slotName]: updated }))
                    setEditingSlot(null)
                  }}
                  onCancel={() => setEditingSlot(null)}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default EquippedGearTab
