import { useEffect, useCallback, useMemo, useState } from 'react'
import type { IParagonBoard, IParagonNode } from '../types'
import { computeBoardLayout, computeWorldBounds } from './boardLayoutEngine'
import { useCanvasTransform } from '../hooks/useCanvasTransform'
import ParagonTooltip from './ParagonTooltip'
import { formatNodeName, getNodeTypeColor } from './paragonNodeUtils'

// ============================================================
// ParagonBoardCanvas — Interactive zoom/pan canvas for paragon boards
// ============================================================
// Renders all paragon boards on a single canvas where they are
// positioned relative to each other via gate connections. Users
// can zoom with mouse wheel (zoom-to-cursor) and pan by dragging.
//
// Architecture:
//   Container (overflow: hidden, captures events)
//     └─ World layer (CSS transform: translate + scale)
//         ├─ SVG connections layer (golden lines between boards)
//         └─ Board groups (one per board, rotated + positioned)
//             └─ ParagonBoardTiles (existing tile rendering logic)
// ============================================================

/**
 * ParagonBoardTiles — Renders the individual node tiles for one board.
 * This is the tile rendering extracted from the previous ParagonBoardVisual,
 * but without its own container — the canvas handles positioning.
 */
function ParagonBoardTiles({
  board,
  onNodeHover,
  onNodeLeave,
  onNodeMouseMove
}: {
  board: IParagonBoard
  onNodeHover: (node: IParagonNode, boardIndex: number) => void
  onNodeLeave: () => void
  onNodeMouseMove: (e: React.MouseEvent) => void
}): React.JSX.Element {
  const positionedNodes = board.allocatedNodes.filter(
    (n) => n.row !== undefined && n.col !== undefined
  )

  if (positionedNodes.length === 0) {
    return <div style={{ color: '#7a7068', fontSize: '12px', padding: '8px' }}>No data</div>
  }

  // Calculate grid bounds
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

  const gridCols = maxCol - minCol + 1
  const gridRows = maxRow - minRow + 1
  const tileSize = 40
  const cellSize = 44
  const padding = 10
  const totalWidth = gridCols * cellSize + padding * 2
  const totalHeight = gridRows * cellSize + padding * 2

  const allocated = positionedNodes.filter((n) => n.allocated)
  const allocatedCount = allocated.length

  return (
    <div
      className="paragon-canvas-board"
      style={{
        position: 'relative',
        width: `${totalWidth}px`,
        height: `${totalHeight}px`,
        backgroundColor: '#0a0a0a',
        borderRadius: '8px',
        border: '1px solid #333',
        overflow: 'visible'
      }}
    >
      {/* Board name label */}
      <div className="paragon-canvas-board__label">
        <span className="paragon-canvas-board__name">{board.boardName}</span>
        {board.glyph && (
          <span className="paragon-canvas-board__glyph">
            {board.glyph.glyphName} (Lv.{board.glyph.level})
          </span>
        )}
        <span className="paragon-canvas-board__count">
          {allocatedCount}/{positionedNodes.length}
        </span>
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
            opacity: 0.3
          }}
        />
      )}

      {/* Render each tile */}
      {positionedNodes.map((node, i) => {
        const col = node.col! - minCol
        const row = node.row! - minRow
        const left = col * cellSize + padding
        const top = row * cellSize + padding
        const typeColor = getNodeTypeColor(node.nodeType)

        return (
          <div
            key={i}
            className={`paragon-canvas-tile ${node.allocated ? 'paragon-canvas-tile--active' : ''}`}
            onMouseEnter={() => onNodeHover(node, board.boardIndex)}
            onMouseMove={onNodeMouseMove}
            onMouseLeave={onNodeLeave}
            style={{
              position: 'absolute',
              left: `${left}px`,
              top: `${top}px`,
              width: `${tileSize}px`,
              height: `${tileSize}px`,
              transform: node.styleTransform || undefined,
              opacity: node.allocated ? 1 : 0.3,
              filter: node.allocated
                ? 'drop-shadow(0px 0px 3px rgba(196, 30, 58, 0.8))'
                : 'grayscale(80%) brightness(0.6)',
              cursor: 'pointer',
              zIndex: 1
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

            {/* Node icon */}
            {(node.iconUrl || node.activeIconUrl) && (
              <img
                src={node.allocated && node.activeIconUrl ? node.activeIconUrl : node.iconUrl}
                alt={formatNodeName(node.nodeName)}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  zIndex: 2
                }}
              />
            )}

            {/* Fallback square if no images */}
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
                  opacity: 0.8
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
 * ParagonBoardCanvas — The main interactive canvas component.
 *
 * Renders all boards on a single zoomable/pannable surface with
 * SVG connection lines between boards.
 */
interface ParagonBoardCanvasProps {
  boards: IParagonBoard[]
}

function ParagonBoardCanvas({ boards }: ParagonBoardCanvasProps): React.JSX.Element {
  // Tooltip state
  const [hoveredNode, setHoveredNode] = useState<IParagonNode | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  // Canvas transform state (zoom + pan)
  // Note: wheel handler is registered internally by useCanvasTransform
  // via addEventListener with { passive: false } to prevent page scroll.
  const {
    containerRef,
    transformStyle,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    isPanning,
    fitAll,
    zoomIn,
    zoomOut,
    zoomPercent
  } = useCanvasTransform()

  // Compute board positions and connections
  const { layouts, connections } = useMemo(() => computeBoardLayout(boards), [boards])
  const worldBounds = useMemo(() => computeWorldBounds(layouts), [layouts])

  // Compute SVG viewBox from world bounds (with padding)
  const svgPadding = 100
  const svgViewBox = `${worldBounds.minX - svgPadding} ${worldBounds.minY - svgPadding} ${worldBounds.width + svgPadding * 2} ${worldBounds.height + svgPadding * 2}`

  // Fit all boards on initial render
  useEffect(() => {
    if (layouts.length > 0) {
      // Small delay to ensure containerRef is measured
      const timer = setTimeout(() => fitAll(worldBounds), 100)
      return (): void => {
        clearTimeout(timer)
      }
    }
    return undefined
  }, [layouts.length]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Handle node hover — show tooltip */
  const handleNodeHover = useCallback((node: IParagonNode, _boardIndex: number) => {
    setHoveredNode(node)
  }, [])

  /** Track cursor for tooltip positioning */
  const handleNodeMouseMove = useCallback((e: React.MouseEvent) => {
    setTooltipPos({ x: e.clientX, y: e.clientY })
  }, [])

  /** Clear tooltip on mouse leave */
  const handleNodeLeave = useCallback(() => {
    setHoveredNode(null)
  }, [])

  /** Reset the view to fit all boards */
  const handleFitAll = useCallback(() => {
    fitAll(worldBounds)
  }, [fitAll, worldBounds])

  if (boards.length === 0) {
    return (
      <div style={{ color: '#7a7068', textAlign: 'center', padding: '20px' }}>
        No paragon boards imported
      </div>
    )
  }

  return (
    <div
      className="paragon-canvas"
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
    >
      {/* Zoom percentage badge */}
      <div className="paragon-canvas__zoom-badge">{zoomPercent}</div>

      {/* Toolbar — zoom controls */}
      <div className="paragon-canvas__toolbar">
        <button className="paragon-canvas__tool-btn" onClick={zoomIn} title="Zoom in">
          +
        </button>
        <button className="paragon-canvas__tool-btn" onClick={zoomOut} title="Zoom out">
          −
        </button>
        <button
          className="paragon-canvas__tool-btn paragon-canvas__tool-btn--fit"
          onClick={handleFitAll}
          title="Fit all boards"
        >
          ⊞
        </button>
      </div>

      {/* World layer — everything inside here is transformed */}
      <div className="paragon-canvas__world" style={{ transform: transformStyle }}>
        {/* SVG layer for connection lines between boards */}
        <svg
          className="paragon-canvas__connections"
          viewBox={svgViewBox}
          style={{
            position: 'absolute',
            top: `${worldBounds.minY - svgPadding}px`,
            left: `${worldBounds.minX - svgPadding}px`,
            width: `${worldBounds.width + svgPadding * 2}px`,
            height: `${worldBounds.height + svgPadding * 2}px`,
            pointerEvents: 'none',
            zIndex: 0
          }}
        >
          <defs>
            {/* Golden glow filter for connection lines */}
            <filter id="connection-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {connections.map((conn, i) => (
            <g key={i}>
              {/* Glow layer */}
              <line
                x1={conn.from.x}
                y1={conn.from.y}
                x2={conn.to.x}
                y2={conn.to.y}
                stroke="#d4a94a"
                strokeWidth="4"
                strokeLinecap="round"
                opacity="0.4"
                filter="url(#connection-glow)"
              />
              {/* Crisp line on top */}
              <line
                x1={conn.from.x}
                y1={conn.from.y}
                x2={conn.to.x}
                y2={conn.to.y}
                stroke="#d4a94a"
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.9"
                strokeDasharray="8 4"
              />
            </g>
          ))}
        </svg>

        {/* Board groups — each board positioned and rotated */}
        {layouts.map((layout) => {
          const board = boards[layout.boardIndex]
          return (
            <div
              key={layout.boardIndex}
              className="paragon-canvas__board-group"
              style={{
                position: 'absolute',
                left: `${layout.x}px`,
                top: `${layout.y}px`,
                width: `${layout.width}px`,
                height: `${layout.height}px`,
                transform: layout.rotation !== 0 ? `rotate(${layout.rotation}deg)` : undefined,
                transformOrigin: 'center center'
              }}
            >
              <ParagonBoardTiles
                board={board}
                onNodeHover={handleNodeHover}
                onNodeLeave={handleNodeLeave}
                onNodeMouseMove={handleNodeMouseMove}
              />
            </div>
          )
        })}
      </div>

      {/* Tooltip — rendered outside the transform layer so it's always readable */}
      <ParagonTooltip
        node={hoveredNode!}
        visible={hoveredNode !== null}
        x={tooltipPos.x}
        y={tooltipPos.y}
      />
    </div>
  )
}

export default ParagonBoardCanvas
