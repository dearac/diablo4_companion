import { useState } from 'react'
import type { ScannedGearPiece, RawBuildData, AffixType, IGearSlot } from '../../../shared/types'
import { evaluatePerfectibility } from '../../../shared/PerfectibilityEngine'
import { normalizeAffix } from '../../../shared/AffixNormalizer'

interface GearTabProps {
  buildData: RawBuildData | null
}

const LEFT_COLUMN = ['Helm', 'Chest Armor', 'Gloves', 'Pants', 'Boots']
const RIGHT_COLUMN = ['Amulet', 'Ring 1', 'Ring 2', 'Weapon', 'Offhand']

function GearTab({ buildData }: GearTabProps): React.JSX.Element {
  const [editingSlot, setEditingSlot] = useState<string | null>(null)
  const [localEdits, setLocalEdits] = useState<Record<string, ScannedGearPiece>>({})
  const [localBuildEdits, setLocalBuildEdits] = useState<Record<string, IGearSlot>>({})

  const getEffectiveGear = (slot: string): ScannedGearPiece | null => {
    return localEdits[slot] || null
  }

  const getEffectiveBuildSlot = (slot: string): IGearSlot | null => {
    if (localBuildEdits[slot]) return localBuildEdits[slot]
    return buildData?.gearSlots.find((gs) => gs.slot === slot) || null
  }

  const handleEditAffix = (slot: string, index: number, newType: AffixType): void => {
    const original = getEffectiveGear(slot)
    if (!original) return

    const updated = { ...original }
    const allAffixes = [
      ...updated.affixes,
      ...updated.temperedAffixes,
      ...updated.greaterAffixes,
      ...updated.implicitAffixes
    ]
    const target = allAffixes[index]
    if (!target) return

    // Remove from old lists, add to new one
    updated.affixes = updated.affixes.filter((a) => a !== target)
    updated.temperedAffixes = updated.temperedAffixes.filter((a) => a !== target)
    updated.greaterAffixes = updated.greaterAffixes.filter((a) => a !== target)
    updated.implicitAffixes = updated.implicitAffixes.filter((a) => a !== target)

    if (newType === 'regular') updated.affixes.push(target)
    else if (newType === 'tempered') updated.temperedAffixes.push(target)
    else if (newType === 'greater') updated.greaterAffixes.push(target)
    else if (newType === 'implicit') updated.implicitAffixes.push(target)

    setLocalEdits((prev) => ({ ...prev, [slot]: updated }))
  }

  const handleMinItemPowerChange = (slot: string, val: string): void => {
    const bs = getEffectiveBuildSlot(slot)
    if (!bs) return
    const num = parseInt(val)
    const updated = { ...bs }
    updated.minItemPower = isNaN(num) ? undefined : num
    setLocalBuildEdits((prev) => ({ ...prev, [slot]: updated }))
  }

  const handleMinValueChange = (slot: string, index: number, val: string): void => {
    const bs = getEffectiveBuildSlot(slot)
    if (!bs || !bs.affixes[index]) return
    const num = parseFloat(val)
    const updated = { ...bs }
    updated.affixes = [...bs.affixes]
    updated.affixes[index] = { ...updated.affixes[index], minValue: isNaN(num) ? undefined : num }
    setLocalBuildEdits((prev) => ({ ...prev, [slot]: updated }))
  }

  const renderColumn = (slots: string[]): React.JSX.Element => (
    <div className="gear-column">
      {slots.map((slotName) => {
        const gear = getEffectiveGear(slotName)
        const buildSlot = getEffectiveBuildSlot(slotName)
        const isEditing = editingSlot === slotName

        // Comparison Logic
        let pct = 0
        let colorClass = 'border'
        let ipFailed = false
        let evaluation: import('../../../shared/types').PerfectibilityResult | null = null

        if (gear && buildSlot) {
          evaluation = evaluatePerfectibility(gear, buildSlot)

          if (!evaluation.steps.powerCheck?.passed) {
            ipFailed = true
            colorClass = 'error'
          } else if (evaluation.overallVerdict === 'PERFECTIBLE') {
            colorClass = 'item-unique'
            pct = 100
          } else if (evaluation.overallVerdict === 'RISKY') {
            colorClass = 'item-rare'
            pct = 75
          } else {
            colorClass = 'error'
            pct = 0
          }
        }

        return (
          <div
            key={slotName}
            className="gear-card"
            style={{ borderLeftColor: `var(--${colorClass})` }}
          >
            <div className="gear-card__header">
              <span className="gear-card__slot">{slotName}</span>
              {gear && buildSlot && <span className="gear-card__match-badge">{pct}% MATCH</span>}
              {gear && !buildSlot && (
                <span className="gear-card__match-badge gear-card__match-badge--no-build">—</span>
              )}
            </div>

            <div className="gear-card__item-info">
              {gear ? (
                <>
                  <h3 className="gear-card__item-name">{gear.itemName}</h3>
                  <div className="gear-card__meta">
                    <span style={{ color: ipFailed ? 'var(--error)' : 'inherit' }}>
                      {gear.itemPower} iP {ipFailed && `(Requires ${buildSlot?.minItemPower})`}
                    </span>
                    <span>{gear.itemType}</span>
                  </div>
                </>
              ) : (
                <span className="gear-card__item-name--empty">Not Scanned</span>
              )}
            </div>

            {gear && buildSlot && evaluation && (
              <>
                <div className="gear-card__affixes" style={{ marginBottom: '16px' }}>
                  {evaluation.steps.implicitAffixes.resolvedImplicits &&
                    evaluation.steps.implicitAffixes.resolvedImplicits.length > 0 && (
                      <div
                        style={{
                          borderBottom: '1px solid var(--border)',
                          paddingBottom: '8px',
                          marginBottom: '8px'
                        }}
                      >
                        {evaluation.steps.implicitAffixes.resolvedImplicits.map((imp) => (
                          <div key={imp} style={{ color: 'var(--text-dim)', fontSize: '0.9em' }}>
                            • {imp}
                          </div>
                        ))}
                      </div>
                    )}
                  {evaluation.steps.baseAffixes.resolvedBaseAffixes.map((a) => (
                    <div key={a} className="gear-card__affix">
                      • {a}
                    </div>
                  ))}
                  {gear.greaterAffixes.map((a) => (
                    <div
                      key={a}
                      className="gear-card__affix"
                      style={{ color: 'var(--item-unique)' }}
                    >
                      ✮ {a}
                    </div>
                  ))}
                  {gear.temperedAffixes.map((a) => (
                    <div key={a} className="gear-card__affix" style={{ color: 'var(--item-rare)' }}>
                      ⚒ {a}
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    backgroundColor: 'rgba(0,0,0,0.2)',
                    padding: '12px',
                    borderRadius: '4px',
                    marginBottom: '16px'
                  }}
                >
                  <div style={{ fontWeight: 'bold', marginBottom: '8px', color: 'var(--text)' }}>
                    Build Checklist
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      fontSize: '0.9em'
                    }}
                  >
                    {/* Implicits Checklist */}
                    {buildSlot.implicitAffixes.map((imp) => {
                      const isMissing = evaluation?.steps.implicitAffixes.missingImplicits.includes(
                        normalizeAffix(imp.name).parsedName || imp.name
                      )
                      return (
                        <div
                          key={`imp-${imp.name}`}
                          style={{ color: isMissing ? 'var(--error)' : 'var(--item-unique)' }}
                        >
                          {isMissing ? '❌ Missing Implicit:' : '✅ Found:'}{' '}
                          {normalizeAffix(imp.name).parsedName || imp.name}
                        </div>
                      )
                    })}
                    {/* Base Affixes Checklist */}
                    {evaluation.steps.baseAffixes.matchDetails?.map((detail, idx) => (
                      <div
                        key={`base-${idx}`}
                        style={{
                          color: detail.matched ? 'var(--item-unique)' : 'var(--item-rare)'
                        }}
                      >
                        {detail.matched ? '✅ Found:' : '⚒️ Reroll target:'}{' '}
                        {detail.canonicalName ?? 'Unknown'}
                      </div>
                    ))}
                    {evaluation.steps.baseAffixes.thresholdFailures?.map((fail, idx) => (
                      <div key={`fail-${idx}`} style={{ color: 'var(--error)' }}>
                        ❌ {fail}
                      </div>
                    ))}
                    {/* Greater Affixes Checklist */}
                    {buildSlot.greaterAffixes.map((ga) => {
                      const isMissing = evaluation?.steps.greaterAffixes.missingGA.includes(
                        normalizeAffix(ga.name).parsedName || ga.name
                      )
                      return (
                        <div
                          key={`ga-${ga.name}`}
                          style={{ color: isMissing ? 'var(--error)' : 'var(--item-unique)' }}
                        >
                          {isMissing ? '❌ Missing GA:' : '✅ Found GA:'}{' '}
                          {normalizeAffix(ga.name).parsedName || ga.name}
                        </div>
                      )
                    })}
                    {/* Required Aspect Checklist */}
                    {evaluation.steps.aspectCheck && (
                      <div
                        style={{
                          color: !evaluation.steps.aspectCheck.passed
                            ? 'var(--item-legendary)'
                            : 'var(--item-unique)'
                        }}
                      >
                        {!evaluation.steps.aspectCheck.passed
                          ? '⚒️ Imprint Aspect:'
                          : '✅ Found Aspect:'}{' '}
                        {evaluation.steps.aspectCheck.expectedAspect}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
            {gear && !buildSlot && (
              <div className="gear-card__affixes" style={{ marginBottom: '16px' }}>
                {gear.implicitAffixes && gear.implicitAffixes.length > 0 && (
                  <div
                    style={{
                      borderBottom: '1px solid var(--border)',
                      paddingBottom: '8px',
                      marginBottom: '8px'
                    }}
                  >
                    {gear.implicitAffixes.map((imp) => (
                      <div key={imp} style={{ color: 'var(--text-dim)', fontSize: '0.9em' }}>
                        • {imp}
                      </div>
                    ))}
                  </div>
                )}
                {[...gear.affixes, ...gear.temperedAffixes, ...gear.greaterAffixes].map((a) => (
                  <div key={a} className="gear-card__affix">
                    • {a}
                  </div>
                ))}
              </div>
            )}

            <div className="gear-card__actions">
              <button
                className="btn btn--outline btn--sm"
                onClick={() => setEditingSlot(isEditing ? null : slotName)}
              >
                {isEditing ? 'Close' : '✏️ Edit Settings'}
              </button>
            </div>

            {isEditing && (
              <div className="affix-editor-overlay">
                {buildSlot && (
                  <div className="affix-editor-section">
                    <div
                      style={{
                        fontWeight: 'bold',
                        fontSize: '12px',
                        marginBottom: '8px',
                        color: 'var(--text-dim)'
                      }}
                    >
                      Build Requirements
                    </div>
                    <div className="affix-editor">
                      <span className="affix-editor__label">Min Item Power</span>
                      <input
                        type="number"
                        className="affix-editor__select"
                        value={buildSlot.minItemPower ?? ''}
                        onChange={(e) => handleMinItemPowerChange(slotName, e.target.value)}
                        placeholder="e.g. 900"
                      />
                    </div>
                    {buildSlot.affixes.map((affix, idx) => (
                      <div key={idx} className="affix-editor">
                        <span
                          className="affix-editor__label"
                          style={{
                            fontSize: '11px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          {affix.name} (Min Roll)
                        </span>
                        <input
                          type="number"
                          step="0.1"
                          className="affix-editor__select"
                          value={affix.minValue ?? ''}
                          onChange={(e) => handleMinValueChange(slotName, idx, e.target.value)}
                          placeholder="Any"
                        />
                      </div>
                    ))}
                  </div>
                )}
                {gear && (
                  <div className="affix-editor-section" style={{ marginTop: '16px' }}>
                    <div
                      style={{
                        fontWeight: 'bold',
                        fontSize: '12px',
                        marginBottom: '8px',
                        color: 'var(--text-dim)'
                      }}
                    >
                      Scanned Gear Preview Setup
                    </div>
                    {[
                      ...gear.affixes,
                      ...gear.temperedAffixes,
                      ...gear.greaterAffixes,
                      ...gear.implicitAffixes
                    ].map((affix, idx) => (
                      <div key={idx} className="affix-editor">
                        <span className="affix-editor__label">{affix}</span>
                        <select
                          className="affix-editor__select"
                          value={
                            gear.affixes.includes(affix)
                              ? 'regular'
                              : gear.temperedAffixes.includes(affix)
                                ? 'tempered'
                                : gear.greaterAffixes.includes(affix)
                                  ? 'greater'
                                  : 'implicit'
                          }
                          onChange={(e) =>
                            handleEditAffix(slotName, idx, e.target.value as AffixType)
                          }
                        >
                          <option value="regular">Regular</option>
                          <option value="tempered">Tempered</option>
                          <option value="greater">Greater</option>
                          <option value="implicit">Implicit</option>
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="gear-grid" id="gear-tab">
      {renderColumn(LEFT_COLUMN)}
      {renderColumn(RIGHT_COLUMN)}
    </div>
  )
}

export default GearTab
