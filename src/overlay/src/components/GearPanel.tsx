import type { IGearSlot, IRune } from '../../../shared/types'

interface GearPanelProps {
  gearSlots: IGearSlot[]
  activeRunes: IRune[]
}

/**
 * GearPanel — Diablo-themed gear slot display for the overlay.
 *
 * Each slot shows:
 * - Header: slot name + rarity badge
 * - Item name in rarity color
 * - Aspect name + description (from tooltip scrape)
 * - Regular affixes (blue stars)
 * - Greater affixes (purple stars)
 * - Tempered affixes (orange anvil icons)
 * - Implicit affixes (muted)
 * - Rampage/Feast special effects
 *
 * Active Runes section shows:
 * - Rune name + type badge
 * - Effects list
 */
function GearPanel({ gearSlots, activeRunes }: GearPanelProps): React.JSX.Element {
  const rc = (type: string): string => type.toLowerCase()

  return (
    <div className="gear-panel">
      {gearSlots.map((slot) => {
        const hasDetails =
          slot.requiredAspect ||
          slot.affixes.length > 0 ||
          slot.implicitAffixes.length > 0 ||
          slot.temperedAffixes.length > 0 ||
          slot.rampageEffect ||
          slot.feastEffect

        return (
          <div key={slot.slot} className={`gear-slot gear-slot--${rc(slot.itemType)}`}>
            {/* Header */}
            <div className="gear-slot__header">
              <span className="gear-slot__name">{slot.slot}</span>
              <span
                className={`gear-slot__type-badge gear-slot__type-badge--${rc(slot.itemType)}`}
              >
                {slot.itemType}
              </span>
            </div>

            {/* Item name */}
            <div
              className={`gear-slot__item-name gear-slot__item-name--${slot.itemName ? rc(slot.itemType) : 'empty'}`}
            >
              {slot.itemName || 'No item specified'}
            </div>

            {hasDetails && <div className="gear-slot__divider" />}

            {/* Aspect */}
            {slot.requiredAspect && (
              <div className="gear-slot__aspect">
                <div className="gear-slot__aspect-name">{slot.requiredAspect.name}</div>
                {slot.requiredAspect.description && (
                  <div className="gear-slot__aspect-desc">{slot.requiredAspect.description}</div>
                )}
              </div>
            )}

            {/* Implicit affixes */}
            {slot.implicitAffixes.length > 0 && (
              <>
                <div className="gear-slot__section-label">Implicit</div>
                <ul className="gear-slot__affix-list">
                  {slot.implicitAffixes.map((affix, i) => (
                    <li key={i} className="gear-slot__affix-item gear-slot__affix-item--implicit">
                      {affix.name}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* Regular + greater affixes */}
            {slot.affixes.length > 0 && (
              <>
                <div className="gear-slot__section-label">Affixes</div>
                <ul className="gear-slot__affix-list">
                  {slot.affixes.map((affix, i) => (
                    <li
                      key={i}
                      className={`gear-slot__affix-item${affix.isGreater ? ' gear-slot__affix-item--greater' : ''}`}
                    >
                      {affix.name}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* Tempered affixes */}
            {slot.temperedAffixes.length > 0 && (
              <>
                <div className="gear-slot__section-label">Tempered</div>
                <ul className="gear-slot__affix-list">
                  {slot.temperedAffixes.map((affix, i) => (
                    <li key={i} className="gear-slot__affix-item gear-slot__affix-item--tempered">
                      {affix.name}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* Rampage / Feast */}
            {slot.rampageEffect && (
              <div className="gear-slot__effect gear-slot__effect--rampage">
                {slot.rampageEffect}
              </div>
            )}
            {slot.feastEffect && (
              <div className="gear-slot__effect gear-slot__effect--feast">
                {slot.feastEffect}
              </div>
            )}

            {/* Socketed gems */}
            {slot.socketedGems && slot.socketedGems.length > 0 && (
              <>
                <div className="gear-slot__section-label">Sockets</div>
                <ul className="gear-slot__affix-list">
                  {slot.socketedGems.map((gem, i) => (
                    <li key={i} className="gear-slot__affix-item gear-slot__affix-item--socket">
                      💎 {gem}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )
      })}

      {/* ── Active Runes Section ── */}
      {activeRunes.length > 0 && (
        <div className="rune-section">
          <div className="rune-section__header">
            <span className="rune-section__title">Active Runes</span>
          </div>
          {activeRunes.map((rune, i) => {
            const isLegendary = rune.runeType.toLowerCase().includes('legendary')
            const rarityClass = isLegendary ? 'legendary' : 'rare'

            return (
              <div key={i} className={`rune-card rune-card--${rarityClass}`}>
                <div className="rune-card__header">
                  <span className="rune-card__name">{rune.name}</span>
                  <span className={`rune-card__type rune-card__type--${rarityClass}`}>
                    {rune.runeType}
                  </span>
                </div>
                {rune.effects.length > 0 && (
                  <ul className="rune-card__effects">
                    {rune.effects.map((effect, j) => (
                      <li key={j} className="rune-card__effect">
                        {effect}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default GearPanel

