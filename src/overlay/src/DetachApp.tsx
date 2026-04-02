import { useState, useEffect, useCallback, useRef } from 'react'
import type { IParagonBoard, IParagonNode } from '../../shared/types'
import ParagonTooltip from '../../shared/components/ParagonTooltip'
import { formatNodeName, getNodeTypeColor } from '../../shared/components/paragonNodeUtils'
import DetachToolbar from './components/DetachToolbar'

/**
 * DetachApp — Root component for the detach overlay window.
 */
/**
 * Default border inset percentage (0-15%).
 * Accounts for the padding between the in-game red border and the first node row.
 * Measured from the screenshot: ~7% on each side.
 */
const DEFAULT_INSET = 7

function DetachApp(): React.JSX.Element {
  const [board, setBoard] = useState<IParagonBoard | null>(null)
  const [opacity, setOpacity] = useState(50)
  const [rotation, setRotation] = useState(0)
  const [scale, setScale] = useState(1)
  const [locked, setLocked] = useState(false)
  const [boardNumber, setBoardNumber] = useState(1)
  const [boardTotal, setBoardTotal] = useState(1)
  const [inset, setInset] = useState(DEFAULT_INSET)

  // Drag-rotate state
  const [isDragRotating, setIsDragRotating] = useState(false)
  const dragStartXRef = useRef(0)
  const dragStartRotationRef = useRef(0)

  // Tooltip state
  const [hoveredNode, setHoveredNode] = useState<IParagonNode | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  // Keep locked in a ref for the document-level wheel listener
  const lockedRef = useRef(locked)
  useEffect(() => {
    lockedRef.current = locked
  }, [locked])

  // Dynamic cell size — derived from window so grid exactly matches in-game spacing
  const [cellSize, setCellSize] = useState(44)

  // Listen for board data from main process
  useEffect(() => {
    window.api.onDetachBoardData((data) => {
      setBoard(data.board)
      setOpacity(data.opacity)
      setRotation(0)
      setBoardNumber(data.boardNumber)
      setBoardTotal(data.boardTotal)

      // Load saved inset or use default
      const savedInset = data.inset ?? DEFAULT_INSET
      setInset(savedInset)

      // Derive cellSize so 21 cells exactly fill the usable window area
      const FULL_GRID = 21
      const insetFrac = savedInset / 100
      const usableW = window.innerWidth * (1 - 2 * insetFrac)
      const usableH = window.innerHeight * (1 - 2 * insetFrac)
      const cs = Math.min(usableW, usableH) / FULL_GRID
      setCellSize(cs)
      setScale(1) // Grid already fits — scale starts at 1:1
    })
  }, [])

  // ── Mouse wheel → scale (document-level to bypass app-region) ────
  useEffect(() => {
    const handleWheel = (e: WheelEvent): void => {
      if (lockedRef.current) return
      e.preventDefault()
      e.stopPropagation()
      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08
      setScale((s) => Math.min(Math.max(s * factor, 0.1), 5))
    }

    document.addEventListener('wheel', handleWheel, { passive: false })
    return () => document.removeEventListener('wheel', handleWheel)
  }, [])

  // Handle opacity changes — save debounced
  const opacityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleOpacityChange = useCallback((value: number) => {
    setOpacity(value)
    if (opacityTimerRef.current) clearTimeout(opacityTimerRef.current)
    opacityTimerRef.current = setTimeout(() => {
      window.api.detachSaveOpacity(value)
    }, 500)
  }, [])

  // Handle inset changes — save debounced
  const insetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleInsetChange = useCallback((value: number) => {
    setInset(value)
    if (insetTimerRef.current) clearTimeout(insetTimerRef.current)
    insetTimerRef.current = setTimeout(() => {
      window.api.detachSaveInset(value)
    }, 500)
  }, [])

  // Rotation controls
  const handleRotateCW = useCallback(() => setRotation((r) => (r + 90) % 360), [])
  const handleRotateCCW = useCallback(() => setRotation((r) => (r - 90 + 360) % 360), [])
  const handleRotateFineCW = useCallback(() => setRotation((r) => r + 5), [])
  const handleRotateFineCCW = useCallback(() => setRotation((r) => r - 5), [])

  // ── Left-click drag → fine rotation ─────────────────────
  const handleBoardMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (locked) return
      if (e.button !== 0) return
      e.preventDefault()
      setIsDragRotating(true)
      dragStartXRef.current = e.clientX
      dragStartRotationRef.current = rotation
    },
    [locked, rotation]
  )

  useEffect(() => {
    if (!isDragRotating) return

    const handleMouseMove = (e: MouseEvent): void => {
      const dx = e.clientX - dragStartXRef.current
      setRotation(dragStartRotationRef.current + dx * 0.5)
    }

    const handleMouseUp = (): void => {
      setIsDragRotating(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragRotating])

  // ── Right-click drag → move window via IPC ─────────────────────
  const [isDragMoving, setIsDragMoving] = useState(false)
  const dragMoveLastPos = useRef({ x: 0, y: 0 })

  // Suppress context menu so right-click is reserved for drag
  useEffect(() => {
    const suppress = (e: Event): void => e.preventDefault()
    document.addEventListener('contextmenu', suppress)
    return () => document.removeEventListener('contextmenu', suppress)
  }, [])

  const handleRightMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (locked) return
      if (e.button !== 2) return
      e.preventDefault()
      setIsDragMoving(true)
      dragMoveLastPos.current = { x: e.screenX, y: e.screenY }
    },
    [locked]
  )

  useEffect(() => {
    if (!isDragMoving) return

    const handleMouseMove = (e: MouseEvent): void => {
      const dx = e.screenX - dragMoveLastPos.current.x
      const dy = e.screenY - dragMoveLastPos.current.y
      dragMoveLastPos.current = { x: e.screenX, y: e.screenY }
      window.api.detachMoveWindow(dx, dy)
    }

    const handleMouseUp = (): void => {
      setIsDragMoving(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragMoving])

  // Reset scale
  const handleResetScale = useCallback(() => setScale(1), [])

  // Save Position / Lock
  const handleLock = useCallback(() => {
    setLocked(true)
    window.api.detachSetIgnoreMouse(true, { forward: true })
    window.api.detachSavePosition()
  }, [])

  const handleUnlock = useCallback(() => {
    setLocked(false)
    window.api.detachSetIgnoreMouse(false)
  }, [])

  // Done — close window
  const handleDone = useCallback(() => {
    window.api.detachClose()
  }, [])

  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        window.api.detachClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Mouse-enter/leave for the floating pill when locked
  const handlePillEnter = useCallback(() => {
    window.api.detachSetIgnoreMouse(false)
  }, [])
  const handlePillLeave = useCallback(() => {
    if (locked) {
      window.api.detachSetIgnoreMouse(true, { forward: true })
    }
  }, [locked])

  // Tooltip handlers
  const handleNodeHover = useCallback((node: IParagonNode) => {
    setHoveredNode(node)
  }, [])
  const handleNodeMouseMove = useCallback((e: React.MouseEvent) => {
    setTooltipPos({ x: e.clientX, y: e.clientY })
  }, [])
  const handleNodeLeave = useCallback(() => {
    setHoveredNode(null)
  }, [])

  if (!board) {
    return <div id="detach-root" />
  }

  // Use full 21x21 board grid so node spacing matches the in-game board exactly
  const FULL_GRID = 21
  const minRow = 0
  const minCol = 0
  const positionedNodes = board.allocatedNodes.filter(
    (n) => n.row !== undefined && n.col !== undefined
  )
  const gridCols = FULL_GRID
  const gridRows = FULL_GRID
  const tileSize = cellSize * 0.9 // maintain same ratio as original 40/44
  const boardPixelW = gridCols * cellSize
  const boardPixelH = gridRows * cellSize

  return (
    <div
      id="detach-root"
      className="detach-root"
      style={{ opacity: opacity / 100 }}
      onMouseDown={handleRightMouseDown}
    >
      {/* Board container — scales + rotates + inset from border, drag to rotate */}
      <div
        className={`detach-board-container ${isDragRotating ? 'detach-board-container--rotating' : ''}`}
        style={{
          transform: `rotate(${rotation}deg) scale(${scale})`,
          width: `${boardPixelW}px`,
          height: `${boardPixelH}px`,
          marginLeft: `${inset}%`,
          marginTop: `${inset}%`,
          cursor: isDragRotating ? 'grabbing' : 'grab'
        }}
        onMouseDown={handleBoardMouseDown}
      >
        <div
          className={`paragon-canvas-board detach-board${locked ? ' paragon-canvas--locked' : ''}`}
          style={{
            position: 'relative',
            width: `${boardPixelW}px`,
            height: `${boardPixelH}px`,
            backgroundColor: '#0a0a0a',
            borderRadius: '8px',
            border: '1px solid #333'
          }}
        >
          {/* Board name */}
          <div className="paragon-canvas-board__label">
            <span className="paragon-canvas-board__name">{board.boardName}</span>
            {board.glyph && (
              <span className="paragon-canvas-board__glyph">
                {board.glyph.glyphName} (Lv.{board.glyph.level})
              </span>
            )}
          </div>

          {/* Background */}
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

          {/* Tiles */}
          {positionedNodes.map((node, i) => {
            // Counter-transform intrinsic d4builds coords to un-rotated in-game frame
            const boardRot = board.boardRotation || 0
            const maxIdx = FULL_GRID - 1 // 20
            let adjRow = node.row! - minRow
            let adjCol = node.col! - minCol
            if (boardRot === 90) {
              adjRow = node.col! - minCol
              adjCol = maxIdx - (node.row! - minRow)
            } else if (boardRot === 180) {
              adjRow = maxIdx - (node.row! - minRow)
              adjCol = maxIdx - (node.col! - minCol)
            } else if (boardRot === 270) {
              adjRow = maxIdx - (node.col! - minCol)
              adjCol = node.row! - minRow
            }
            const left = adjCol * cellSize
            const top = adjRow * cellSize
            const typeColor = getNodeTypeColor(node.nodeType)
            const tileClasses = [
              'paragon-canvas-tile',
              node.allocated ? 'paragon-canvas-tile--active' : 'paragon-canvas-tile--inactive'
            ].join(' ')

            return (
              <div
                key={i}
                className={tileClasses}
                onMouseEnter={() => handleNodeHover(node)}
                onMouseMove={handleNodeMouseMove}
                onMouseLeave={handleNodeLeave}
                style={{
                  position: 'absolute',
                  left: `${left}px`,
                  top: `${top}px`,
                  width: `${tileSize}px`,
                  height: `${tileSize}px`,
                  // Per-tile rotation removed — no longer needed since we
                  // counter-transform coordinates instead of rotating the container
                  cursor: 'pointer',
                  zIndex: 1
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
      </div>

      {/* Toolbar — always interactive */}
      <DetachToolbar
        opacity={opacity}
        rotation={rotation}
        scale={scale}
        locked={locked}
        inset={inset}
        boardName={board.boardName}
        boardNumber={boardNumber}
        boardTotal={boardTotal}
        onOpacityChange={handleOpacityChange}
        onInsetChange={handleInsetChange}
        onRotateCW={handleRotateCW}
        onRotateCCW={handleRotateCCW}
        onRotateFineCW={handleRotateFineCW}
        onRotateFineCCW={handleRotateFineCCW}
        onResetScale={handleResetScale}
        onLock={handleLock}
        onUnlock={handleUnlock}
        onDone={handleDone}
        onPillEnter={handlePillEnter}
        onPillLeave={handlePillLeave}
      />

      {/* Tooltip */}
      {!locked && (
        <ParagonTooltip
          node={hoveredNode!}
          visible={hoveredNode !== null}
          x={tooltipPos.x}
          y={tooltipPos.y}
        />
      )}
    </div>
  )
}

export default DetachApp
