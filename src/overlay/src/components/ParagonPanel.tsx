import type { IParagonBoard } from '../../../shared/types'

interface ParagonPanelProps {
  boards: IParagonBoard[]
}

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

/**
 * ParagonPanel — Renders paragon boards with glyph info, node counts,
 * and a visual path representation.
 */
function ParagonPanel({ boards }: ParagonPanelProps): React.JSX.Element {
  /** Count nodes by type for a board */
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
