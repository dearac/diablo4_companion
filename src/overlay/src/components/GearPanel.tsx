import type { IGearSlot } from '../../../shared/types'

interface GearPanelProps {
  gearSlots: IGearSlot[]
}

/**
 * GearPanel — Renders gear slot requirements.
 * Each slot shows item type, required aspect, priority affixes,
 * tempering targets, and masterwork priority.
 */

/** Color for item type badge */
const TYPE_COLORS: Record<string, string> = {
  Unique: '#a855f7', // Purple
  Legendary: '#f97316', // Orange
  Rare: '#eab308' // Yellow
}

function GearPanel({ gearSlots }: GearPanelProps): React.JSX.Element {
  return (
    <div className="gear-panel">
      {gearSlots.map((slot) => (
        <div key={slot.slot} className="gear-slot">
          <div className="gear-slot__header">
            <h3 className="gear-slot__name">{slot.slot.toUpperCase()}</h3>
            <span
              className="gear-slot__type-badge"
              style={{ color: TYPE_COLORS[slot.itemType] || '#ccc' }}
            >
              {slot.itemType}
              {slot.itemName ? `: ${slot.itemName}` : ''}
            </span>
          </div>

          {slot.requiredAspect && (
            <div className="gear-slot__aspect">
              <span className="gear-slot__label">Aspect:</span> {slot.requiredAspect}
            </div>
          )}

          {slot.priorityAffixes.length > 0 && (
            <div className="gear-slot__affixes">
              <span className="gear-slot__label">Affixes:</span>
              <ol className="gear-slot__affix-list">
                {slot.priorityAffixes.map((affix, i) => (
                  <li key={i} className="gear-slot__affix-item">
                    {affix.name}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {slot.temperingTargets.length > 0 && (
            <div className="gear-slot__temper">
              <span className="gear-slot__label">Temper:</span> {slot.temperingTargets.join(', ')}
            </div>
          )}

          {slot.masterworkPriority.length > 0 && (
            <div className="gear-slot__masterwork">
              <span className="gear-slot__label">MW:</span> {slot.masterworkPriority.join(', ')}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default GearPanel
