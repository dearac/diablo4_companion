import { useState } from 'react'
import type { RawBuildData } from '../../../shared/types'
import ParagonBoardCanvas from '../../../shared/components/ParagonBoardCanvas'

/**
 * BuildSummaryCard — Displays a successful import result.
 *
 * Shows build metadata, a collapsible preview of skills/paragon/gear,
 * and a launch button for the overlay.
 */
interface BuildSummaryCardProps {
  build: RawBuildData
  onLaunchOverlay: () => void
}

type DetailSection = 'skills' | 'paragon' | 'gear' | null

function BuildSummaryCard({ build, onLaunchOverlay }: BuildSummaryCardProps): React.JSX.Element {
  const [expanded, setExpanded] = useState<DetailSection>(null)

  const glyphCount = build.paragonBoards.filter((b) => b.glyph !== null).length

  const toggleSection = (section: DetailSection): void => {
    setExpanded((prev) => (prev === section ? null : section))
  }

  return (
    <div className="build-summary">
      <h2 className="build-summary__name">⚔ {build.name}</h2>
      <div className="build-summary__divider" />

      <div className="build-summary__meta">
        <div className="build-summary__stat">
          <span className="build-summary__label">Class</span>
          <span className="build-summary__value">{build.d4Class}</span>
        </div>
        <div className="build-summary__stat">
          <span className="build-summary__label">Level</span>
          <span className="build-summary__value">{build.level}</span>
        </div>
      </div>

      <div className="build-summary__sections">
        {/* Skills */}
        <button
          className={`build-summary__section-toggle ${expanded === 'skills' ? 'active' : ''}`}
          onClick={() => toggleSection('skills')}
        >
          <span>⚡ Skills</span>
          <span className="build-summary__badge">{build.skills.length}</span>
        </button>
        {expanded === 'skills' && (
          <div className="build-summary__detail">
            {build.skills.length === 0 ? (
              <p className="build-summary__empty">No skills found</p>
            ) : (
              <ul className="build-summary__list">
                {build.skills.map((skill, i) => (
                  <li key={i} className={`build-summary__skill ${skill.nodeType}`}>
                    <span className="build-summary__skill-name">{skill.skillName}</span>
                    <span className="build-summary__skill-pts">
                      {skill.points}/{skill.maxPoints}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Paragon — now renders the interactive canvas */}
        <button
          className={`build-summary__section-toggle ${expanded === 'paragon' ? 'active' : ''}`}
          onClick={() => toggleSection('paragon')}
        >
          <span>🔷 Paragon</span>
          <span className="build-summary__badge">
            {build.paragonBoards.length} boards, {glyphCount} glyphs
          </span>
        </button>
        {expanded === 'paragon' && (
          <div className="build-summary__detail build-summary__detail--paragon">
            {build.paragonBoards.length === 0 ? (
              <p className="build-summary__empty">No paragon boards found</p>
            ) : (
              <div className="build-summary__paragon-canvas-wrapper">
                <ParagonBoardCanvas boards={build.paragonBoards} />
              </div>
            )}
          </div>
        )}

        {/* Gear */}
        <button
          className={`build-summary__section-toggle ${expanded === 'gear' ? 'active' : ''}`}
          onClick={() => toggleSection('gear')}
        >
          <span>🛡️ Gear</span>
          <span className="build-summary__badge">
            {build.gearSlots.length} slots
            {(build.activeRunes?.length || 0) > 0 && `, ${build.activeRunes.length} runes`}
          </span>
        </button>
        {expanded === 'gear' && (
          <div className="build-summary__detail build-summary__detail--gear">
            {build.gearSlots.length === 0 ? (
              <p className="build-summary__empty">No gear found</p>
            ) : (
              <div className="gear-panel">
                {build.gearSlots.map((slot) => {
                  const rc = (t: string): string => t.toLowerCase()
                  const hasDetails =
                    slot.requiredAspect ||
                    slot.affixes.length > 0 ||
                    slot.implicitAffixes.length > 0 ||
                    slot.temperedAffixes.length > 0 ||
                    slot.rampageEffect ||
                    slot.feastEffect

                  return (
                    <div
                      key={slot.slot}
                      className={`gear-slot gear-slot--${rc(slot.itemType)}`}
                    >
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
                          <div className="gear-slot__aspect-name">
                            {slot.requiredAspect.name}
                          </div>
                          {slot.requiredAspect.description && (
                            <div className="gear-slot__aspect-desc">
                              {slot.requiredAspect.description}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Implicit affixes */}
                      {slot.implicitAffixes.length > 0 && (
                        <>
                          <div className="gear-slot__section-label">Implicit</div>
                          <ul className="gear-slot__affix-list">
                            {slot.implicitAffixes.map((affix, i) => (
                              <li
                                key={i}
                                className="gear-slot__affix-item gear-slot__affix-item--implicit"
                              >
                                {affix.name}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}

                      {/* Affixes */}
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
                              <li
                                key={i}
                                className="gear-slot__affix-item gear-slot__affix-item--tempered"
                              >
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
                              <li
                                key={i}
                                className="gear-slot__affix-item gear-slot__affix-item--socket"
                              >
                                💎 {gem}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Active Runes */}
            {(build.activeRunes?.length || 0) > 0 && (
              <div className="rune-section">
                <div className="rune-section__header">
                  <span className="rune-section__title">Active Runes</span>
                </div>
                {build.activeRunes.map((rune, i) => {
                  const isLegendary = rune.runeType
                    .toLowerCase()
                    .includes('legendary')
                  const rarityClass = isLegendary ? 'legendary' : 'rare'
                  return (
                    <div
                      key={i}
                      className={`rune-card rune-card--${rarityClass}`}
                    >
                      <div className="rune-card__header">
                        <span className="rune-card__name">{rune.name}</span>
                        <span
                          className={`rune-card__type rune-card__type--${rarityClass}`}
                        >
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
        )}
      </div>

      <button id="launch-overlay-button" className="launch-button" onClick={onLaunchOverlay}>
        🗡️ Launch Overlay
      </button>
    </div>
  )
}

export default BuildSummaryCard
