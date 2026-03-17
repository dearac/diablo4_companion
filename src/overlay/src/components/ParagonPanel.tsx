import type { IParagonBoard } from '../../../shared/types'

interface ParagonPanelProps {
  boards: IParagonBoard[]
}

/**
 * ParagonPanel — Renders paragon boards with glyph info and node counts.
 * Node types are color-coded to match D4 rarity colors:
 *   Normal = white, Magic = blue, Rare = yellow, Legendary = orange.
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
