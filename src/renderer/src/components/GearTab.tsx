import { useState } from 'react'
import type { ScannedGearPiece, RawBuildData, AffixType } from '../../../shared/types'
import { affixMatches } from '../../../shared/AffixMatcher'

interface GearTabProps {
  buildData: RawBuildData | null
  equippedGear: Record<string, ScannedGearPiece>
}

const LEFT_COLUMN = ['Helm', 'Chest Armor', 'Gloves', 'Pants', 'Boots']
const RIGHT_COLUMN = ['Amulet', 'Ring 1', 'Ring 2', 'Weapon', 'Offhand']

function GearTab({ buildData, equippedGear }: GearTabProps): React.JSX.Element {
  const [editingSlot, setEditingSlot] = useState<string | null>(null)
  const [localEdits, setLocalEdits] = useState<Record<string, ScannedGearPiece>>({})

  const getEffectiveGear = (slot: string): ScannedGearPiece | null => {
    return localEdits[slot] || equippedGear[slot] || null
  }

  const handleEditAffix = (slot: string, index: number, newType: AffixType): void => {
    const original = getEffectiveGear(slot)
    if (!original) return

    const updated = { ...original }
    const allAffixes = [...updated.affixes, ...updated.temperedAffixes, ...updated.greaterAffixes, ...updated.implicitAffixes]
    const target = allAffixes[index]
    if (!target) return

    // Remove from old lists, add to new one
    updated.affixes = updated.affixes.filter(a => a !== target)
    updated.temperedAffixes = updated.temperedAffixes.filter(a => a !== target)
    updated.greaterAffixes = updated.greaterAffixes.filter(a => a !== target)
    updated.implicitAffixes = updated.implicitAffixes.filter(a => a !== target)

    if (newType === 'regular') updated.affixes.push(target)
    else if (newType === 'tempered') updated.temperedAffixes.push(target)
    else if (newType === 'greater') updated.greaterAffixes.push(target)
    else if (newType === 'implicit') updated.implicitAffixes.push(target)

    setLocalEdits(prev => ({ ...prev, [slot]: updated }))
  }

  const renderColumn = (slots: string[]): React.JSX.Element => (
    <div className="gear-column">
      {slots.map(slotName => {
        const gear = getEffectiveGear(slotName)
        const buildSlot = buildData?.gearSlots.find(gs => gs.slot === slotName)
        const isEditing = editingSlot === slotName

        // Comparison Logic
        const matched: string[] = []
        const missing: string[] = []
        let pct = 0
        let colorClass = 'border'

        if (gear && buildSlot) {
          const buildReqs = [
            ...buildSlot.affixes.map(a => a.name),
            ...buildSlot.temperedAffixes.map(a => a.name),
            ...buildSlot.greaterAffixes.map(a => a.name)
          ]
          const gearAffixes = [
            ...gear.affixes,
            ...gear.temperedAffixes,
            ...gear.greaterAffixes,
            ...gear.implicitAffixes
          ]

          buildReqs.forEach(req => {
            if (gearAffixes.some(ga => affixMatches(ga, req))) matched.push(req)
            else missing.push(req)
          })

          const total = matched.length + missing.length
          pct = total > 0 ? Math.round((matched.length / total) * 100) : 0
          
          if (pct >= 100) colorClass = 'item-unique'
          else if (pct >= 75) colorClass = 'item-legendary'
          else if (pct >= 50) colorClass = 'item-rare'
          else colorClass = 'error'
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
              {gear && !buildSlot && <span className="gear-card__match-badge gear-card__match-badge--no-build">—</span>}
            </div>

            <div className="gear-card__item-info">
              {gear ? (
                <>
                  <h3 className="gear-card__item-name">{gear.itemName}</h3>
                  <div className="gear-card__meta">
                    <span>{gear.itemPower} iP</span>
                    <span>{gear.rarity}</span>
                  </div>
                </>
              ) : (
                <span className="gear-card__item-name--empty">Not Scanned</span>
              )}
            </div>

            {gear && buildSlot && (
              <div className="gear-card__affixes">
                {matched.map(a => (
                  <div key={a} className="gear-card__affix gear-card__affix--match">
                    <span className="gear-card__affix-icon">✅</span> {a}
                  </div>
                ))}
                {missing.map(a => (
                  <div key={a} className="gear-card__affix gear-card__affix--miss">
                    <span className="gear-card__affix-icon">❌</span> {a}
                  </div>
                ))}
              </div>
            )}
            {gear && !buildSlot && (
              <div className="gear-card__affixes">
                {[...gear.affixes, ...gear.temperedAffixes, ...gear.greaterAffixes, ...gear.implicitAffixes].map(a => (
                  <div key={a} className="gear-card__affix">• {a}</div>
                ))}
              </div>
            )}

            <div className="gear-card__actions">
              <button 
                className="btn btn--outline btn--sm"
                onClick={() => setEditingSlot(isEditing ? null : slotName)}
              >
                {isEditing ? 'Close' : '✏️ Edit'}
              </button>
            </div>

            {isEditing && gear && (
              <div className="affix-editor-overlay">
                {[...gear.affixes, ...gear.temperedAffixes, ...gear.greaterAffixes, ...gear.implicitAffixes].map((affix, idx) => (
                  <div key={idx} className="affix-editor">
                    <span className="affix-editor__label">{affix}</span>
                    <select 
                      className="affix-editor__select"
                      value={
                        gear.affixes.includes(affix) ? 'regular' :
                        gear.temperedAffixes.includes(affix) ? 'tempered' :
                        gear.greaterAffixes.includes(affix) ? 'greater' : 'implicit'
                      }
                      onChange={(e) => handleEditAffix(slotName, idx, e.target.value as AffixType)}
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
