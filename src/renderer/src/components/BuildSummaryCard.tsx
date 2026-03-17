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
          <span className="build-summary__badge">{build.gearSlots.length} slots</span>
        </button>
        {expanded === 'gear' && (
          <div className="build-summary__detail">
            {build.gearSlots.length === 0 ? (
              <p className="build-summary__empty">No gear found</p>
            ) : (
              <ul className="build-summary__list">
                {build.gearSlots.map((gear, i) => (
                  <li key={i} className="build-summary__gear">
                    <span className="build-summary__gear-slot">{gear.slot}</span>
                    <span className={`build-summary__gear-name ${gear.itemType.toLowerCase()}`}>
                      {gear.itemName || 'Any item'}
                    </span>
                    <span className="build-summary__gear-type">{gear.itemType}</span>
                  </li>
                ))}
              </ul>
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
