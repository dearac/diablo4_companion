import type { IGearSlot, IRune, ScannedGearPiece } from '../../../shared/types'
import { affixMatches } from '../../../shared/AffixMatcher'

interface GearPanelProps {
  gearSlots: IGearSlot[]
  activeRunes: IRune[]
  equippedGear?: Record<string, ScannedGearPiece>
  onClearEquipped?: () => void
}

/**
 * Deduplicates an IAffix array by name.
 * Prefers the isGreater variant when both exist.
 */
function dedupeAffixes(
  affixes: { name: string; isGreater: boolean }[]
): { name: string; isGreater: boolean }[] {
  const seen = new Map<string, { name: string; isGreater: boolean }>()
  for (const a of affixes) {
    const existing = seen.get(a.name)
    if (!existing || (a.isGreater && !existing.isGreater)) {
      seen.set(a.name, a)
    }
  }
  return [...seen.values()]
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
 * - Equipped Status: matched/missing affixes + improvement suggestions
 *
 * Active Runes section shows:
 * - Rune name + type badge
 * - Effects list
 */
function GearPanel({
  gearSlots,
  activeRunes,
  equippedGear,
  onClearEquipped
}: GearPanelProps): React.JSX.Element {
  const rc = (type: string): string => type.toLowerCase()

  return (
    <div className="gear-panel">
      {/* Clear equipped gear button */}
      {equippedGear && Object.keys(equippedGear).length > 0 && onClearEquipped && (
        <div className="gear-panel__clear-row">
          <button className="gear-panel__clear-btn" onClick={onClearEquipped}>
            🗑️ Clear Equipped Gear
          </button>
        </div>
      )}

      {gearSlots.map((slot) => {
        const uniqueAffixes = dedupeAffixes(slot.affixes)
        const uniqueTempered = dedupeAffixes(slot.temperedAffixes)
        const hasDetails =
          slot.requiredAspect ||
          uniqueAffixes.length > 0 ||
          slot.implicitAffixes.length > 0 ||
          uniqueTempered.length > 0 ||
          slot.rampageEffect ||
          slot.feastEffect

        // Get equipped item for this slot (if any)
        const equipped = equippedGear?.[slot.slot] ?? null

        return (
          <div key={slot.slot} className={`gear-slot gear-slot--${rc(slot.itemType)}`}>
            {/* Header */}
            <div className="gear-slot__header">
              <span className="gear-slot__name">{slot.slot}</span>
              <span className={`gear-slot__type-badge gear-slot__type-badge--${rc(slot.itemType)}`}>
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

            {/* Regular + greater affixes (deduplicated) */}
            {uniqueAffixes.length > 0 && (
              <>
                <div className="gear-slot__section-label">Affixes</div>
                <ul className="gear-slot__affix-list">
                  {uniqueAffixes.map((affix, i) => (
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

            {/* Tempered affixes (deduplicated) */}
            {uniqueTempered.length > 0 && (
              <>
                <div className="gear-slot__section-label">Tempered</div>
                <ul className="gear-slot__affix-list">
                  {uniqueTempered.map((affix, i) => (
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
              <div className="gear-slot__effect gear-slot__effect--feast">{slot.feastEffect}</div>
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

            {/* ── Equipped Status ── */}
            {equipped &&
              (() => {
                const allBuildAffixes = slot.affixes.map((a) => a.name)
                const allEquippedAffixes = [
                  ...equipped.affixes,
                  ...equipped.temperedAffixes,
                  ...equipped.greaterAffixes
                ]

                const matched: string[] = []
                const missing: string[] = []
                for (const buildAffix of allBuildAffixes) {
                  const found = allEquippedAffixes.some((ea) => affixMatches(ea, buildAffix))
                  if (found) matched.push(buildAffix)
                  else missing.push(buildAffix)
                }

                const expectedAspectName = slot.requiredAspect?.name ?? null
                const equippedAspectName = equipped.aspect?.name ?? null
                let aspectMatch = true
                if (expectedAspectName && equippedAspectName) {
                  aspectMatch =
                    equippedAspectName.toLowerCase().includes(expectedAspectName.toLowerCase()) ||
                    expectedAspectName.toLowerCase().includes(equippedAspectName.toLowerCase())
                } else if (expectedAspectName && !equippedAspectName) {
                  aspectMatch = false
                }

                const hasSuggestions = missing.length > 0 || !aspectMatch

                return (
                  <div className="equipped-status">
                    <div className="equipped-status__label">Equipped Status</div>
                    <div className="equipped-status__item-name">
                      {equipped.itemName} ({equipped.itemPower} iP)
                    </div>

                    {matched.length > 0 && (
                      <div className="equipped-status__matches">
                        {matched.map((a, i) => (
                          <div
                            key={i}
                            className="equipped-status__affix equipped-status__affix--match"
                          >
                            ✅ {a}
                          </div>
                        ))}
                      </div>
                    )}
                    {missing.length > 0 && (
                      <div className="equipped-status__matches">
                        {missing.map((a, i) => (
                          <div
                            key={i}
                            className="equipped-status__affix equipped-status__affix--missing"
                          >
                            ❌ {a}
                          </div>
                        ))}
                      </div>
                    )}

                    {expectedAspectName && (
                      <div
                        className={`equipped-status__aspect ${aspectMatch ? 'equipped-status__aspect--match' : 'equipped-status__aspect--missing'}`}
                      >
                        {aspectMatch ? '✅' : '❌'} Aspect: {expectedAspectName}
                      </div>
                    )}

                    {hasSuggestions && (
                      <div className="equipped-status__suggestions">
                        <div className="equipped-status__suggestion-label">Suggestions</div>
                        {missing.length > 0 && (
                          <div className="equipped-status__suggestion">
                            🔧 <strong>Enchant:</strong> Reroll a non-build affix → {missing[0]}
                          </div>
                        )}
                        {missing.length > 1 && (
                          <div className="equipped-status__suggestion">
                            ⚒️ <strong>Temper:</strong> Add {missing[1]} at Blacksmith
                          </div>
                        )}
                        {matched.length > 0 && (
                          <div className="equipped-status__suggestion">
                            ⭐ <strong>Masterwork:</strong> Prioritize {matched[0]}
                          </div>
                        )}
                        {!aspectMatch && expectedAspectName && (
                          <div className="equipped-status__suggestion">
                            🔮 <strong>Aspect:</strong> Replace with {expectedAspectName}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}
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
