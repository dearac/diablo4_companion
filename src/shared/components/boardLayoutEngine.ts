import type { IParagonBoard } from '../types'

// ============================================================
// BOARD LAYOUT ENGINE — Positions paragon boards on a canvas
// ============================================================
// Pure logic: given an ordered list of paragon boards, computes
// absolute (x, y) positions and rotation for each board so they
// can be rendered on a single interactive canvas.
//
// Layout strategy (priority order):
//   1. USE SCRAPED POSITIONS — If boards have boardX/boardY from
//      d4builds' CSS (inline top/left), use those directly. This
//      gives pixel-perfect layout matching the source site.
//   2. FALLBACK: Linear chain — If no position data, stack boards
//      vertically with a gap (legacy behavior for non-d4builds).
//
// d4builds coordinate system:
//   - Origin (0,0) = Starting Board
//   - Each board is 1258px × 1258px in "site units"
//   - Negative Y = visually above the starting board
//   - Positive X = visually to the right
//   - We normalize to our own pixel scale (CELL_SIZE × 21 per board)
// ============================================================

/**
 * Layout result for a single board on the canvas.
 * Coordinates are in "world" pixels (before zoom/pan).
 */
export interface BoardLayout {
  /** Index into the original boards array */
  boardIndex: number
  /** World-space X position of the board's top-left corner */
  x: number
  /** World-space Y position of the board's top-left corner */
  y: number
  /** Rotation in degrees (from boardRotation) */
  rotation: number
  /** Pixel width of the board at 1:1 scale */
  width: number
  /** Pixel height of the board at 1:1 scale */
  height: number
}

/**
 * A connection line between two boards, drawn via SVG.
 * Coordinates are in world-space pixels.
 */
export interface BoardConnection {
  /** World-space start point (gate on the source board) */
  from: { x: number; y: number }
  /** World-space end point (entry on the destination board) */
  to: { x: number; y: number }
}

/** Size of each tile cell in pixels (40px tile + 4px gap) */
const CELL_SIZE = 44

/** Tile size within each cell */
const TILE_SIZE = 40

/** Padding around the board grid */
const BOARD_PADDING = 10

/** Gap between connected boards (fallback layout only) */
const BOARD_GAP = 60

/**
 * d4builds uses 1258px as the board unit size for positioning.
 * We normalize these to our own coordinate system.
 */
const D4B_BOARD_UNIT = 1258

/**
 * Measures the pixel dimensions of a board based on its node positions.
 * Returns { rows, cols, minRow, minCol, width, height }.
 */
function measureBoard(board: IParagonBoard): {
  rows: number
  cols: number
  minRow: number
  minCol: number
  width: number
  height: number
} {
  const positioned = board.allocatedNodes.filter((n) => n.row !== undefined && n.col !== undefined)

  if (positioned.length === 0) {
    return { rows: 1, cols: 1, minRow: 0, minCol: 0, width: 100, height: 100 }
  }

  let minRow = Infinity,
    maxRow = -Infinity,
    minCol = Infinity,
    maxCol = -Infinity

  for (const node of positioned) {
    if (node.row! < minRow) minRow = node.row!
    if (node.row! > maxRow) maxRow = node.row!
    if (node.col! < minCol) minCol = node.col!
    if (node.col! > maxCol) maxCol = node.col!
  }

  const rows = maxRow - minRow + 1
  const cols = maxCol - minCol + 1
  const width = cols * CELL_SIZE + BOARD_PADDING * 2
  const height = rows * CELL_SIZE + BOARD_PADDING * 2

  return { rows, cols, minRow, minCol, width, height }
}

// ============================================================
// PRIMARY LAYOUT: Scraped positions from d4builds
// ============================================================

/**
 * Checks if the boards have d4builds position data (boardX/boardY).
 * At least 2 boards must have non-zero positions to be useful,
 * OR board 0 at (0,0) counts as having position data.
 */
function hasSitePositions(boards: IParagonBoard[]): boolean {
  if (boards.length <= 1) return false
  // If any board has non-zero position data, the site provided positions
  return boards.some(
    (b) => (b.boardX !== undefined && b.boardX !== 0) || (b.boardY !== undefined && b.boardY !== 0)
  )
}

/**
 * Computes board layout using the CSS positions scraped from d4builds.
 *
 * d4builds positions boards using `top` and `left` in multiples of
 * 1258px. We normalize these to our pixel coordinate system where
 * each board occupies measureBoard().width × measureBoard().height.
 */
function computeFromSitePositions(boards: IParagonBoard[]): {
  layouts: BoardLayout[]
  connections: BoardConnection[]
} {
  const measurements = boards.map((b) => measureBoard(b))
  const layouts: BoardLayout[] = []
  const connections: BoardConnection[] = []

  // Find the "standard" board size for scaling.
  // Non-starting boards are full 21×21 grids. Use the largest
  // measured board as our reference for normalizing site units.
  let maxBoardWidth = 0
  let maxBoardHeight = 0
  for (const m of measurements) {
    if (m.width > maxBoardWidth) maxBoardWidth = m.width
    if (m.height > maxBoardHeight) maxBoardHeight = m.height
  }

  // Scale factor: convert d4builds 1258px units to our pixel space
  const scaleX = maxBoardWidth / D4B_BOARD_UNIT
  const scaleY = maxBoardHeight / D4B_BOARD_UNIT

  // Find the minimum site positions to normalize (so origin is at 0,0)
  let minSiteX = Infinity
  let minSiteY = Infinity
  for (const b of boards) {
    const sx = b.boardX ?? 0
    const sy = b.boardY ?? 0
    if (sx < minSiteX) minSiteX = sx
    if (sy < minSiteY) minSiteY = sy
  }

  for (let i = 0; i < boards.length; i++) {
    const board = boards[i]
    const m = measurements[i]

    // Normalize site position to world pixels
    const siteX = (board.boardX ?? 0) - minSiteX
    const siteY = (board.boardY ?? 0) - minSiteY

    // Convert from site units to our pixel coordinate system
    // Center each board within its grid cell for consistent appearance
    const worldX = siteX * scaleX + (maxBoardWidth - m.width) / 2
    const worldY = siteY * scaleY + (maxBoardHeight - m.height) / 2

    layouts.push({
      boardIndex: i,
      x: worldX,
      y: worldY,
      rotation: board.boardRotation || 0,
      width: m.width,
      height: m.height
    })
  }

  // Build connection lines between consecutive boards
  for (let i = 1; i < layouts.length; i++) {
    const prev = layouts[i - 1]
    const curr = layouts[i]

    // Connect from the center of the previous board to the center
    // of the current board (the SVG line is decorative)
    connections.push({
      from: {
        x: prev.x + prev.width / 2,
        y: prev.y + prev.height / 2
      },
      to: {
        x: curr.x + curr.width / 2,
        y: curr.y + curr.height / 2
      }
    })
  }

  return { layouts, connections }
}

// ============================================================
// FALLBACK LAYOUT: Linear chain (no site positions)
// ============================================================

/**
 * Determines which side of the board a gate node is on.
 * Returns 'top' | 'bottom' | 'left' | 'right' based on
 * how close the gate is to each edge.
 */
function getGateSide(
  gateRow: number,
  gateCol: number,
  minRow: number,
  minCol: number,
  rows: number,
  cols: number
): 'top' | 'bottom' | 'left' | 'right' {
  const relRow = gateRow - minRow
  const relCol = gateCol - minCol

  // Distance from each edge (normalized 0..1)
  const distTop = relRow / (rows - 1 || 1)
  const distBottom = 1 - distTop
  const distLeft = relCol / (cols - 1 || 1)
  const distRight = 1 - distLeft

  const min = Math.min(distTop, distBottom, distLeft, distRight)
  if (min === distTop) return 'top'
  if (min === distBottom) return 'bottom'
  if (min === distLeft) return 'left'
  return 'right'
}

/**
 * Computes the world-space position of a gate node within its board.
 */
function gateWorldPosition(
  gateRow: number,
  gateCol: number,
  minRow: number,
  minCol: number,
  boardX: number,
  boardY: number
): { x: number; y: number } {
  const relCol = gateCol - minCol
  const relRow = gateRow - minRow
  return {
    x: boardX + relCol * CELL_SIZE + BOARD_PADDING + TILE_SIZE / 2,
    y: boardY + relRow * CELL_SIZE + BOARD_PADDING + TILE_SIZE / 2
  }
}

/**
 * Fallback layout: linear chain from gate to gate.
 * Used when boards don't have d4builds position data.
 */
function computeFallbackLayout(boards: IParagonBoard[]): {
  layouts: BoardLayout[]
  connections: BoardConnection[]
} {
  const measurements = boards.map((b) => measureBoard(b))
  const layouts: BoardLayout[] = []
  const connections: BoardConnection[] = []

  // Board 0 at the origin
  layouts.push({
    boardIndex: 0,
    x: 0,
    y: 0,
    rotation: boards[0].boardRotation || 0,
    width: measurements[0].width,
    height: measurements[0].height
  })

  for (let i = 1; i < boards.length; i++) {
    const prevBoard = boards[i - 1]
    const prevMeasure = measurements[i - 1]
    const prevLayout = layouts[i - 1]
    const currMeasure = measurements[i]

    // Find outgoing gate on previous board — take the LAST gate node
    const prevGates = prevBoard.allocatedNodes.filter(
      (n) => n.nodeType === 'gate' && n.row !== undefined && n.col !== undefined
    )

    // Default: place below the previous board
    let newX = prevLayout.x
    let newY = prevLayout.y + prevLayout.height + BOARD_GAP

    let fromPoint = {
      x: prevLayout.x + prevLayout.width / 2,
      y: prevLayout.y + prevLayout.height
    }
    let toPoint = { x: newX + currMeasure.width / 2, y: newY }

    if (prevGates.length > 0) {
      const outGate = prevGates[prevGates.length - 1]
      const gateSide = getGateSide(
        outGate.row!,
        outGate.col!,
        prevMeasure.minRow,
        prevMeasure.minCol,
        prevMeasure.rows,
        prevMeasure.cols
      )

      const gatePos = gateWorldPosition(
        outGate.row!,
        outGate.col!,
        prevMeasure.minRow,
        prevMeasure.minCol,
        prevLayout.x,
        prevLayout.y
      )

      fromPoint = gatePos

      switch (gateSide) {
        case 'bottom':
          newX = gatePos.x - currMeasure.width / 2
          newY = prevLayout.y + prevLayout.height + BOARD_GAP
          toPoint = { x: newX + currMeasure.width / 2, y: newY }
          break
        case 'top':
          newX = gatePos.x - currMeasure.width / 2
          newY = prevLayout.y - currMeasure.height - BOARD_GAP
          toPoint = { x: newX + currMeasure.width / 2, y: newY + currMeasure.height }
          break
        case 'right':
          newX = prevLayout.x + prevLayout.width + BOARD_GAP
          newY = gatePos.y - currMeasure.height / 2
          toPoint = { x: newX, y: newY + currMeasure.height / 2 }
          break
        case 'left':
          newX = prevLayout.x - currMeasure.width - BOARD_GAP
          newY = gatePos.y - currMeasure.height / 2
          toPoint = { x: newX + currMeasure.width, y: newY + currMeasure.height / 2 }
          break
      }
    }

    layouts.push({
      boardIndex: i,
      x: newX,
      y: newY,
      rotation: boards[i].boardRotation || 0,
      width: currMeasure.width,
      height: currMeasure.height
    })

    connections.push({ from: fromPoint, to: toPoint })
  }

  return { layouts, connections }
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * computeBoardLayout — Main entry point.
 *
 * Given an ordered array of paragon boards, computes canvas
 * positions for each. Uses scraped d4builds positions when
 * available, falls back to linear chain layout otherwise.
 */
export function computeBoardLayout(boards: IParagonBoard[]): {
  layouts: BoardLayout[]
  connections: BoardConnection[]
} {
  if (boards.length === 0) {
    return { layouts: [], connections: [] }
  }

  // Use site positions if available (d4builds scraper provides these)
  if (hasSitePositions(boards)) {
    return computeFromSitePositions(boards)
  }

  // Fallback: linear chain layout
  return computeFallbackLayout(boards)
}

/**
 * Computes the bounding box that contains all board layouts.
 * Used by the canvas to determine initial zoom/offset.
 */
export function computeWorldBounds(layouts: BoardLayout[]): {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
} {
  if (layouts.length === 0) {
    return { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 }
  }

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity

  for (const l of layouts) {
    if (l.x < minX) minX = l.x
    if (l.y < minY) minY = l.y
    if (l.x + l.width > maxX) maxX = l.x + l.width
    if (l.y + l.height > maxY) maxY = l.y + l.height
  }

  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

// Export constants for use by other modules
export { CELL_SIZE, TILE_SIZE, BOARD_PADDING }
