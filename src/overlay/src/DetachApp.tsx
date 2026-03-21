import { useState, useEffect, useCallback, useRef } from 'react'
import type { IParagonBoard, IParagonNode } from '../../shared/types'
import ParagonTooltip from '../../shared/components/ParagonTooltip'
import { formatNodeName, getNodeTypeColor } from '../../shared/components/paragonNodeUtils'
import DetachToolbar from './components/DetachToolbar'

/**
 * DetachApp — Root component for the detach overlay window.
 */
function DetachApp(): React.JSX.Element {
    const [board, setBoard] = useState<IParagonBoard | null>(null)
    const [opacity, setOpacity] = useState(50)
    const [rotation, setRotation] = useState(0)
    const [scale, setScale] = useState(1)
    const [locked, setLocked] = useState(false)
    const [boardNumber, setBoardNumber] = useState(1)
    const [boardTotal, setBoardTotal] = useState(1)

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

    // Listen for board data from main process
    useEffect(() => {
        window.api.onDetachBoardData((data) => {
            setBoard(data.board)
            setOpacity(data.opacity)
            setRotation(data.board.boardRotation || 0)
            setBoardNumber(data.boardNumber)
            setBoardTotal(data.boardTotal)

            // Auto-fit: use full 21x21 board grid so overlay spacing matches in-game
            const FULL_GRID = 21
            const cs = 44, pad = 10
            const bW = FULL_GRID * cs + pad * 2
            const bH = FULL_GRID * cs + pad * 2
            const fitScale = Math.min(
                (window.innerWidth * 0.9) / bW,
                (window.innerHeight * 0.9) / bH
            )
            setScale(fitScale)
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

    // Lock/Unlock
    const handleLock = useCallback(() => {
        setLocked(true)
        window.api.detachSetIgnoreMouse(true, { forward: true })
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
    const tileSize = 40
    const cellSize = 44
    const padding = 10
    const boardPixelW = gridCols * cellSize + padding * 2
    const boardPixelH = gridRows * cellSize + padding * 2

    return (
        <div
            id="detach-root"
            className="detach-root"
            style={{ opacity: opacity / 100 }}
            onMouseDown={handleRightMouseDown}
        >
            {/* Board container — scales + rotates, drag to rotate */}
            <div
                className={`detach-board-container ${isDragRotating ? 'detach-board-container--rotating' : ''}`}
                style={{
                    transform: `rotate(${rotation}deg) scale(${scale})`,
                    width: `${boardPixelW}px`,
                    height: `${boardPixelH}px`,
                    cursor: isDragRotating ? 'grabbing' : 'grab'
                }}
                onMouseDown={handleBoardMouseDown}
            >
                <div
                    className="paragon-canvas-board detach-board"
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
                        const col = node.col! - minCol
                        const row = node.row! - minRow
                        const left = col * cellSize + padding
                        const top = row * cellSize + padding
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
                                    transform: node.styleTransform || undefined,
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
                boardName={board.boardName}
                boardNumber={boardNumber}
                boardTotal={boardTotal}
                onOpacityChange={handleOpacityChange}
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
