import { useState } from 'react'
import type { RawBuildData, IParagonBoard, IParagonNode } from '../../../shared/types'

/**
 * NAME_MAP — Translates d4builds.gg stat abbreviation alt-text
 * into human-readable names for tooltips.
 */
const NAME_MAP: Record<string, string> = {
  Int: 'Intelligence',
  Str: 'Strength',
  Dex: 'Dexterity',
  Will: 'Willpower',
  DamageToElite: 'Damage to Elites',
  DamagePhysical: 'Physical Damage',
  DamageReduction: 'Damage Reduction',
  DamageReductionWhileFortified: 'DR While Fortified',
  DamageReductionWhileInjured: 'DR While Injured',
  DamageReductionFromCloseEnemies: 'DR from Close Enemies',
  DamageReductionFromDistantEnemies: 'DR from Distant Enemies',
  MaxLife: 'Maximum Life',
  Armor: 'Armor',
  CritChance: 'Critical Strike Chance',
  CritDamage: 'Critical Strike Damage',
  OverpowerDamage: 'Overpower Damage',
  HealingReceived: 'Healing Received',
  AttackSpeed: 'Attack Speed',
  CooldownReduction: 'Cooldown Reduction',
  ResourceGeneration: 'Resource Generation',
  ResistAll: 'All Resistances',
  Gate: 'Gate',
  VulnerableDamage: 'Vulnerable Damage',
  NonPhysicalDamage: 'Non-Physical Damage'
}

function formatNodeName(raw: string): string {
  if (NAME_MAP[raw]) return NAME_MAP[raw]
  return raw.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
}

function getNodeTypeColor(nodeType: IParagonNode['nodeType']): string {
  switch (nodeType) {
    case 'legendary':
      return '#ff8c00'
    case 'rare':
      return '#ffd700'
    case 'magic':
      return '#6888ff'
    case 'gate':
      return '#00cc88'
    default:
      return '#999'
  }
}

/**
 * ParagonBoardVisual — Renders a single paragon board as a positioned
 * grid of node tiles within the Config Window's build summary.
 */
function ParagonBoardVisual({ board }: { board: IParagonBoard }): React.JSX.Element {
  const positionedNodes = board.allocatedNodes.filter(
    (n) => n.row !== undefined && n.col !== undefined
  )

  if (positionedNodes.length === 0) {
    return <p style={{ color: '#7a7068', fontSize: '12px' }}>No position data available</p>
  }

  let minRow = Infinity,
    maxRow = -Infinity,
    minCol = Infinity,
    maxCol = -Infinity
  for (const node of positionedNodes) {
    if (node.row! < minRow) minRow = node.row!
    if (node.row! > maxRow) maxRow = node.row!
    if (node.col! < minCol) minCol = node.col!
    if (node.col! > maxCol) maxCol = node.col!
  }

  const gridRows = maxRow - minRow + 1
  const gridCols = maxCol - minCol + 1
  const tileSize = 40
  const cellSize = 44
  const padding = 10
  const totalWidth = gridCols * cellSize + padding * 2
  const totalHeight = gridRows * cellSize + padding * 2

  const allocated = positionedNodes.filter((n) => n.allocated)

  return (
    <div
      className="paragon-visual-container"
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: `${totalWidth} / ${totalHeight}`,
        overflow: 'hidden',
        backgroundColor: '#0a0a0a',
        borderRadius: '8px',
        border: '1px solid #333',
        margin: '12px auto'
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '6px',
          right: '8px',
          zIndex: 10,
          fontSize: '11px',
          color: '#d4a94a',
          background: 'rgba(0,0,0,0.7)',
          padding: '2px 8px',
          borderRadius: '4px'
        }}
      >
        {allocated.length} / {positionedNodes.length} nodes
      </div>

      {board.boardBgUrl && (
        <img
          src={board.boardBgUrl}
          alt=""
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: 0.3,
            transform: `rotate(${board.boardRotation || 0}deg)`
          }}
        />
      )}

      {positionedNodes.map((node, i) => {
        const col = node.col! - minCol
        const row = node.row! - minRow
        const leftPct = ((col * cellSize + padding) / totalWidth) * 100
        const topPct = ((row * cellSize + padding) / totalHeight) * 100
        const widthPct = (tileSize / totalWidth) * 100
        const heightPct = (tileSize / totalHeight) * 100

        const displayName = formatNodeName(node.nodeName)
        const typeColor = getNodeTypeColor(node.nodeType)

        return (
          <div
            key={i}
            title={`${displayName}\n${node.nodeType.toUpperCase()}${node.allocated ? ' ✓ Allocated' : ''}`}
            style={{
              position: 'absolute',
              left: `${leftPct}%`,
              top: `${topPct}%`,
              width: `${widthPct}%`,
              height: `${heightPct}%`,
              transform: node.styleTransform || undefined,
              cursor: 'help',
              opacity: node.allocated ? 1 : 0.3,
              filter: node.allocated ? 'none' : 'grayscale(80%) brightness(0.6)',
              transition: 'opacity 0.15s ease, filter 0.15s ease'
            }}
          >
            {node.bgUrl && (
              <img
                src={node.bgUrl}
                alt=""
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
            {(node.iconUrl || node.activeIconUrl) && (
              <img
                src={node.allocated && node.activeIconUrl ? node.activeIconUrl : node.iconUrl}
                alt={displayName}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  zIndex: 2,
                  filter: node.allocated
                    ? 'drop-shadow(0px 0px 3px rgba(196, 30, 58, 0.8))'
                    : 'none'
                }}
              />
            )}
            {!node.bgUrl && !node.iconUrl && (
              <div
                style={{
                  position: 'absolute',
                  top: '10%',
                  left: '10%',
                  width: '80%',
                  height: '80%',
                  backgroundColor: typeColor,
                  borderRadius:
                    node.nodeType === 'legendary' || node.nodeType === 'gate' ? '50%' : '4px',
                  border: `1px solid ${typeColor}`,
                  opacity: 0.8,
                  zIndex: 0
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

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
