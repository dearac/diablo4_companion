import { useState } from 'react'
import type { RawBuildData } from '../../../shared/types'

/**
 * BuildSummaryCard — Displays a successful import result.
 *
 * Shows build metadata, a collapsible preview of skills/paragon/gear,
 * and a launch button for the overlay.
 */

import type { IParagonBoard } from '../../../shared/types'

function ParagonBoardVisual({ board }: { board: IParagonBoard }): React.JSX.Element {
  // Logic size of the board from the site is 1155px
  const boardSize = 55 * 21

  return (
    <div
      className="paragon-visual-container"
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '1 / 1',
        overflow: 'hidden',
        backgroundColor: '#0a0a0a',
        borderRadius: '8px',
        border: '1px solid #333',
        margin: '16px auto'
      }}
    >
      <div
        className="paragon-board-exact"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: board.boardBgUrl ? `url(${board.boardBgUrl})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          transform: `rotate(${board.boardRotation || 0}deg)`
        }}
      >
        {board.allocatedNodes
          .filter((n) => n.row !== undefined && n.col !== undefined)
          .map((node, i) => {
            // Convert exact positioning to percentages relative to the 1155px board
            const topPct = ((node.row! * 55 - 5) / boardSize) * 100
            const leftPct = ((node.col! * 55 - 5) / boardSize) * 100
            const sizePct = (40 / boardSize) * 100

            return (
              <button
                key={i}
                className="paragon-board-exact-tile"
                title={`${node.nodeName} (${node.nodeType})`}
                style={{
                  position: 'absolute',
                  top: `${topPct}%`,
                  left: `${leftPct}%`,
                  width: `${sizePct}%`,
                  height: `${sizePct}%`,
                  padding: 0,
                  border: 'none',
                  background: 'none',
                  transform: node.styleTransform || 'rotate(0deg)',
                  cursor: 'help',
                  opacity: node.allocated ? 1 : 0.35,
                  filter: node.allocated ? 'none' : 'grayscale(100%)'
                }}
              >
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                  {/* Only render icons if present, falling back to CSS shapes otherwise */}
                  {node.iconUrl && (
                    <img
                      src={node.activeIconUrl || node.iconUrl}
                      alt={node.nodeName}
                      title={`${node.nodeName} (${node.nodeType})`}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        zIndex: 2,
                        filter: 'drop-shadow(0px 0px 4px rgba(255,255,255,0.7))'
                      }}
                    />
                  )}
                  {node.bgUrl && (
                    <img
                      src={node.bgUrl}
                      alt="bg"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        zIndex: 1
                      }}
                    />
                  )}
                  {/* Fallback styling if image fails/missing */}
                  {!node.bgUrl && (
                    <div
                      title={`${node.nodeName} (${node.nodeType})`}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        backgroundColor:
                          node.nodeType === 'legendary'
                            ? '#ff8c00'
                            : node.nodeType === 'rare'
                              ? '#ffd700'
                              : node.nodeType === 'magic'
                                ? '#0055ff'
                                : '#666',
                        borderRadius:
                          node.nodeType === 'legendary' || node.nodeType === 'gate' ? '50%' : '4px',
                        border:
                          node.nodeType !== 'normal'
                            ? '2px solid rgba(255,255,255,0.8)'
                            : '1px solid #999',
                        zIndex: 0
                      }}
                    />
                  )}
                </div>
              </button>
            )
          })}
      </div>
    </div>
  )
}

interface BuildSummaryCardProps {
  build: RawBuildData
  onLaunchOverlay: () => void
}

/** Which detail section is expanded */
type DetailSection = 'skills' | 'paragon' | 'gear' | null

function BuildSummaryCard({ build, onLaunchOverlay }: BuildSummaryCardProps): React.JSX.Element {
  const [expanded, setExpanded] = useState<DetailSection>(null)

  /** Count boards with glyphs */
  const glyphCount = build.paragonBoards.filter((b) => b.glyph !== null).length

  /** Toggle a section open/closed */
  const toggleSection = (section: DetailSection): void => {
    setExpanded((prev) => (prev === section ? null : section))
  }

  return (
    <div className="build-summary">
      <h2 className="build-summary__name">⚔ {build.name}</h2>
      <div className="build-summary__divider" />

      {/* Metadata row */}
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

      {/* Expandable sections */}
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

        {/* Paragon */}
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
          <div className="build-summary__detail">
            {build.paragonBoards.length === 0 ? (
              <p className="build-summary__empty">No paragon boards found</p>
            ) : (
              <ul className="build-summary__list">
                {build.paragonBoards.map((board, i) => (
                  <li key={i} className="build-summary__board">
                    <span className="build-summary__board-name">{board.boardName}</span>
                    {board.glyph && (
                      <span className="build-summary__glyph">
                        ◆ {board.glyph.glyphName} (Lv{board.glyph.level})
                      </span>
                    )}
                    <ParagonBoardVisual board={board} />
                  </li>
                ))}
              </ul>
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
