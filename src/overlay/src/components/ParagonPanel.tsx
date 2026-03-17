import type { IParagonBoard, IParagonNode } from '../../../shared/types'

interface ParagonPanelProps {
  boards: IParagonBoard[]
}

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
  ResistFire: 'Fire Resistance',
  ResistCold: 'Cold Resistance',
  ResistLightning: 'Lightning Resistance',
  ResistPoison: 'Poison Resistance',
  ResistShadow: 'Shadow Resistance',
  ThornsPhysical: 'Physical Thorns',
  Gate: 'Gate',
  GlyphRange: 'Glyph Range',
  VulnerableDamage: 'Vulnerable Damage',
  NonPhysicalDamage: 'Non-Physical Damage',
  DamageOverTime: 'Damage Over Time',
  UltimateDamage: 'Ultimate Damage',
  CoreDamage: 'Core Skill Damage',
  CompanionDamage: 'Companion Damage',
  BerserkDamage: 'Berserk Damage'
}

/**
 * Formats a raw node name from a d4builds PascalCase abbreviation
 * into a human-readable display name.
 */
function formatNodeName(raw: string): string {
  // 1. Check our manual translation map first
  if (NAME_MAP[raw]) return NAME_MAP[raw]
  // 2. Fall back to splitting PascalCase
  return raw.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
}

/**
 * Gets a color for the node type to use in the tooltip and fallback rendering.
 */
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
 * grid of node tiles. The grid is dynamically sized based on the actual
 * row/col data from the scraper.
 *
 * Board metrics from d4builds.gg:
 *   - Each tile is 40x40px in the source
 *   - Grid spacing is ~44px (40px tile + 4px gap)
 *   - Board backgrounds are ~1255px squares
 *   - Grids range from 14×11 (starting board) to 20×20 (full boards)
 */
function ParagonBoardVisual({ board }: { board: IParagonBoard }): React.JSX.Element {
  // Filter to only tiles with position data
  const positionedNodes = board.allocatedNodes.filter(
    (n) => n.row !== undefined && n.col !== undefined
  )

  if (positionedNodes.length === 0) {
    return <p style={{ color: '#7a7068', fontSize: '12px' }}>No position data available</p>
  }

  // Calculate dynamic grid bounds from actual node positions
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
  // Use 44px grid cells (40px tile + 4px gap) — add padding around edges
  const tileSize = 40
  const cellSize = 44
  const padding = 10
  const totalWidth = gridCols * cellSize + padding * 2
  const totalHeight = gridRows * cellSize + padding * 2

  // Stats summary
  const allocated = positionedNodes.filter((n) => n.allocated)
  const allocatedCount = allocated.length

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
      {/* Node count badge */}
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
        {allocatedCount} / {positionedNodes.length} nodes
      </div>

      {/* Board background */}
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

      {/* Render each tile */}
      {positionedNodes.map((node, i) => {
        // Position relative to the grid bounds
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
            {/* Background tile image */}
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

            {/* Node icon (use active version for allocated nodes) */}
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

            {/* Fallback if no images */}
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
 * ParagonPanel — Renders paragon boards with glyph info, node counts,
 * and a visual path representation.
 */
function ParagonPanel({ boards }: ParagonPanelProps): React.JSX.Element {
  /** Count allocated nodes by type for a board */
  const countByType = (board: IParagonBoard): Record<string, number> => {
    return board.allocatedNodes
      .filter((n) => n.allocated)
      .reduce<Record<string, number>>((counts, node) => {
        counts[node.nodeType] = (counts[node.nodeType] || 0) + 1
        return counts
      }, {})
  }

  return (
    <div className="paragon-panel">
      {boards.map((board) => {
        const counts = countByType(board)
        const totalAllocated = board.allocatedNodes.filter((n) => n.allocated).length
        return (
          <div key={board.boardIndex} className="paragon-board">
            <h3 className="paragon-board__name">
              Board {board.boardIndex + 1}: {board.boardName}
            </h3>
            {board.glyph ? (
              <p className="paragon-board__glyph">
                Glyph: {board.glyph.glyphName} (Lv.{board.glyph.level})
              </p>
            ) : (
              <p className="paragon-board__glyph paragon-board__glyph--none">Glyph: None</p>
            )}
            <p style={{ fontSize: '11px', color: '#7a7068', margin: '2px 0 8px' }}>
              {totalAllocated} allocated of {board.allocatedNodes.length} total nodes
            </p>

            <ParagonBoardVisual board={board} />

            <div className="paragon-board__counts">
              <span className="node-count node-count--normal">Normal: {counts['normal'] || 0}</span>
              <span className="node-count node-count--magic">Magic: {counts['magic'] || 0}</span>
              <span className="node-count node-count--rare">Rare: {counts['rare'] || 0}</span>
              <span className="node-count node-count--legendary">
                Legendary: {counts['legendary'] || 0}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default ParagonPanel
