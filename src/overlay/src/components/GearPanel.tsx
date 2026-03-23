import type { IGearSlot, IRune, ScannedGearPiece } from '../../../shared/types'
import { affixMatches } from '../../../shared/AffixMatcher'

interface GearPanelProps {
  gearSlots: IGearSlot[]
  activeRunes: IRune[]
  equippedGear?: Record<string, ScannedGearPiece>
  onClearEquipped?: () => void
}

/** Canonical slot order for display */
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
 * GearPanel — Compact equipped gear cards with hover tooltips.
 *
 * Each card shows: slot name, match %, item name, quick status.
 * Hovering reveals a detailed tooltip with affix breakdown and
 * vendor-specific crafting recommendations.
 */
function GearPanel({
  gearSlots,
  activeRunes,
  equippedGear,
  onClearEquipped
}: GearPanelProps): React.JSX.Element {
  const hasEquipped = equippedGear && Object.keys(equippedGear).length > 0
  const equippedSlots = SLOT_ORDER.filter((s) => equippedGear?.[s])

  return (
    <div className="gear-panel">
      {hasEquipped && onClearEquipped && (
        <div className="gear-panel__clear-row">
          <button className="gear-panel__clear-btn" onClick={onClearEquipped}>
            🗑️ Clear Equipped Gear
          </button>
        </div>
      )}

      {!hasEquipped && (
        <div className="gear-panel__empty">
          <div className="gear-panel__empty-icon">🛡️</div>
          <div>No equipped gear scanned yet</div>
          <div className="gear-panel__empty-hint">
            Switch to Equip mode (F8) then scan each slot (F7)
          </div>
        </div>
      )}

      {equippedSlots.map((slotName) => {
        const equipped = equippedGear![slotName]
        const buildSlot: IGearSlot | undefined = gearSlots.find((gs) => gs.slot === slotName)

        // Compare affixes
        const buildAffixNames = buildSlot
          ? [
              ...new Set([
                ...buildSlot.affixes.map((a) => a.name),
                ...buildSlot.temperedAffixes.map((a) => a.name),
                ...buildSlot.greaterAffixes.map((a) => a.name)
              ])
            ]
          : []
        const allEquippedAffixes = [
          ...equipped.affixes,
          ...equipped.temperedAffixes,
          ...equipped.greaterAffixes
        ]

        const matched: string[] = []
        const missing: string[] = []
        for (const ba of buildAffixNames) {
          if (allEquippedAffixes.some((ea) => affixMatches(ea, ba))) matched.push(ba)
          else missing.push(ba)
        }

        const total = matched.length + missing.length
        const pct = total > 0 ? Math.round((matched.length / total) * 100) : 100
        const status = getStatus(pct)

        // Aspect check
        const expectedAspect = buildSlot?.requiredAspect?.name ?? null
        const equippedAspect = equipped.aspect?.name ?? null
        let aspectMatch = true
        if (expectedAspect && equippedAspect) {
          aspectMatch =
            equippedAspect.toLowerCase().includes(expectedAspect.toLowerCase()) ||
            expectedAspect.toLowerCase().includes(equippedAspect.toLowerCase())
        } else if (expectedAspect && !equippedAspect) {
          aspectMatch = false
        }

        // Tempered check
        const buildTemperedNames = buildSlot
          ? [...new Set(buildSlot.temperedAffixes.map((a) => a.name))]
          : []
        const missingTempers = buildTemperedNames.filter(
          (bt) => !allEquippedAffixes.some((ea) => affixMatches(ea, bt))
        )

        // Build tooltip actions
        const actions: { icon: string; vendor: string; text: string }[] = []
        if (missing.length > 0) {
          actions.push({
            icon: '🔧',
            vendor: 'Occultist',
            text: `Reroll → ${missing[0]}`
          })
        }
        for (const mt of missingTempers) {
          actions.push({ icon: '⚒️', vendor: 'Blacksmith', text: `Temper: ${mt}` })
        }
        if (!aspectMatch && expectedAspect) {
          actions.push({
            icon: '🔮',
            vendor: 'Occultist',
            text: `Imprint: ${expectedAspect}`
          })
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
          <div key={slotName} className={`gear-card gear-card--${status.cls}`}>
            {/* Compact summary — always visible */}
            <div className="gear-card__row">
              <span className="gear-card__slot">{slotName}</span>
              <span className={`gear-card__badge gear-card__badge--${status.cls}`}>
                {status.icon} {pct}%
              </span>
            </div>
            <div className="gear-card__name">
              {equipped.itemName || 'Unknown'}
              {equipped.itemPower > 0 && (
                <span className="gear-card__ip"> · {equipped.itemPower} iP</span>
              )}
            </div>
            {needsWork && (
              <div className="gear-card__action-hint">
                {actions.length > 0 && `${actions[0].icon} ${actions[0].text}`}
                {actions.length > 1 && ` +${actions.length - 1} more`}
              </div>
            )}
            {!needsWork && (
              <div className="gear-card__action-hint gear-card__action-hint--good">
                ✅ Build match — Masterwork {matched[0]}
              </div>
            )}

            {/* Hover tooltip — detailed recommendations */}
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

              {/* Affix breakdown */}
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

              {/* Actions */}
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
          </div>
        )
      })}

      {/* Active Runes */}
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
