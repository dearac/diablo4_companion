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

/**
 * GearPanel — Shows EQUIPPED gear compared to the build.
 *
 * Only shows slots where the user has scanned equipped gear.
 * For each slot:
 *   - Shows the equipped item name + power
 *   - Compares affixes vs what the build wants (✅/❌)
 *   - Shows aspect match status
 *   - Gives actionable improvement suggestions (enchant, temper, masterwork)
 *
 * If no equipped gear is scanned, shows an instruction message.
 */
function GearPanel({
  gearSlots,
  activeRunes,
  equippedGear,
  onClearEquipped
}: GearPanelProps): React.JSX.Element {
  const hasEquipped = equippedGear && Object.keys(equippedGear).length > 0

  // Determine which slots to show: only those with equipped gear
  const equippedSlots = SLOT_ORDER.filter((s) => equippedGear?.[s])

  return (
    <div className="gear-panel">
      {/* Clear equipped gear button */}
      {hasEquipped && onClearEquipped && (
        <div className="gear-panel__clear-row">
          <button className="gear-panel__clear-btn" onClick={onClearEquipped}>
            🗑️ Clear Equipped Gear
          </button>
        </div>
      )}

      {/* Empty state */}
      {!hasEquipped && (
        <div className="gear-panel__empty">
          <div className="gear-panel__empty-icon">🛡️</div>
          <div>No equipped gear scanned yet</div>
          <div className="gear-panel__empty-hint">
            Switch to Equip mode (F8) then scan each slot (F7)
          </div>
        </div>
      )}

      {/* Equipped gear slots with build comparison */}
      {equippedSlots.map((slotName) => {
        const equipped = equippedGear![slotName]
        const buildSlot: IGearSlot | undefined = gearSlots.find((gs) => gs.slot === slotName)

        // Compare affixes: what the build wants vs what we have
        const buildAffixNames = buildSlot ? [...new Set(buildSlot.affixes.map((a) => a.name))] : []
        const allEquippedAffixes = [
          ...equipped.affixes,
          ...equipped.temperedAffixes,
          ...equipped.greaterAffixes
        ]

        const matched: string[] = []
        const missing: string[] = []
        for (const buildAffix of buildAffixNames) {
          const found = allEquippedAffixes.some((ea) => affixMatches(ea, buildAffix))
          if (found) matched.push(buildAffix)
          else missing.push(buildAffix)
        }

        const totalExpected = matched.length + missing.length
        const matchPct =
          totalExpected > 0 ? Math.round((matched.length / totalExpected) * 100) : 100

        // Aspect comparison
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

        // Build tempered affixes the user is missing
        const buildTemperedNames = buildSlot
          ? [...new Set(buildSlot.temperedAffixes.map((a) => a.name))]
          : []
        const missingTempers = buildTemperedNames.filter(
          (bt) => !allEquippedAffixes.some((ea) => affixMatches(ea, bt))
        )

        const ratingClass =
          matchPct >= 100 ? 'perfect' : matchPct >= 75 ? 'good' : matchPct >= 50 ? 'fair' : 'poor'

        return (
          <div key={slotName} className="gear-slot gear-slot--equipped">
            {/* Header */}
            <div className="gear-slot__header">
              <span className="gear-slot__name">{slotName}</span>
              <span className={`gear-slot__match-badge gear-slot__match-badge--${ratingClass}`}>
                {matchPct}%
              </span>
            </div>

            {/* Equipped item info */}
            <div className="gear-slot__item-name gear-slot__item-name--legendary">
              {equipped.itemName || 'Unknown Item'}
            </div>
            <div className="gear-slot__item-power">
              {equipped.itemPower > 0 ? `${equipped.itemPower} Item Power` : ''}
            </div>

            <div className="gear-slot__divider" />

            {/* Build affix comparison */}
            {totalExpected > 0 && (
              <>
                <div className="gear-slot__section-label">
                  Build Affixes ({matched.length}/{totalExpected})
                </div>
                <ul className="gear-slot__affix-list">
                  {matched.map((a, i) => (
                    <li
                      key={`m-${i}`}
                      className="gear-slot__affix-item gear-slot__affix-item--matched"
                    >
                      ✅ {a}
                    </li>
                  ))}
                  {missing.map((a, i) => (
                    <li
                      key={`x-${i}`}
                      className="gear-slot__affix-item gear-slot__affix-item--missing"
                    >
                      ❌ {a}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* Aspect match */}
            {expectedAspect && (
              <div
                className={`gear-slot__aspect-status gear-slot__aspect-status--${aspectMatch ? 'match' : 'missing'}`}
              >
                {aspectMatch ? '✅' : '❌'} Aspect: {expectedAspect}
              </div>
            )}

            {/* Improvement suggestions */}
            {(missing.length > 0 || missingTempers.length > 0 || !aspectMatch) && (
              <div className="gear-slot__suggestions">
                <div className="gear-slot__section-label">How to Improve</div>
                {missing.length > 0 && (
                  <div className="gear-slot__suggestion">
                    🔧 <strong>Enchant:</strong> Reroll a non-build affix → {missing[0]}
                  </div>
                )}
                {missingTempers.length > 0 &&
                  missingTempers.map((mt, i) => (
                    <div key={i} className="gear-slot__suggestion">
                      ⚒️ <strong>Temper:</strong> {mt}
                    </div>
                  ))}
                {matched.length > 0 && (
                  <div className="gear-slot__suggestion">
                    ⭐ <strong>Masterwork:</strong> Prioritize {matched[0]}
                  </div>
                )}
                {!aspectMatch && expectedAspect && (
                  <div className="gear-slot__suggestion">
                    🔮 <strong>Aspect:</strong> Replace with {expectedAspect}
                  </div>
                )}
              </div>
            )}

            {/* Masterwork suggestion when build is already matched */}
            {missing.length === 0 &&
              missingTempers.length === 0 &&
              aspectMatch &&
              matched.length > 0 && (
                <div className="gear-slot__suggestions">
                  <div className="gear-slot__section-label">Masterwork Priority</div>
                  <div className="gear-slot__suggestion gear-slot__suggestion--good">
                    ⭐ This item matches the build! Masterwork {matched[0]}
                  </div>
                </div>
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
