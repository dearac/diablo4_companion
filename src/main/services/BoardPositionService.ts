import { screen } from 'electron'

/**
 * The calibrated board region in screen coordinates.
 */
export interface BoardRegion {
  x: number
  y: number
  width: number
  height: number
}

/**
 * BoardPositionService — manages the calibrated paragon board position.
 *
 * Two-step flow:
 * 1. User calibrates by dragging a rectangle over the in-game board (snipping tool style)
 * 2. Subsequent scans use the saved calibration to position the overlay precisely
 */
export class BoardPositionService {
  private calibration: BoardRegion | null = null

  /** Whether the board position has been calibrated */
  get isCalibrated(): boolean {
    return this.calibration !== null
  }

  /** Gets the calibrated region */
  get region(): BoardRegion | null {
    return this.calibration
  }

  /**
   * Saves a calibrated board region.
   * @param region - The rectangle the user selected
   */
  saveCalibration(region: BoardRegion): void {
    this.calibration = region
    console.log(
      `[BoardPosition] Calibration saved: (${region.x}, ${region.y}) ${region.width}x${region.height}`
    )
  }

  /**
   * Loads calibration from stored data (e.g., electron-store).
   */
  loadCalibration(data: BoardRegion | null): void {
    this.calibration = data
    if (data) {
      console.log(
        `[BoardPosition] Calibration loaded: (${data.x}, ${data.y}) ${data.width}x${data.height}`
      )
    }
  }

  /** Clears the saved calibration */
  clearCalibration(): void {
    this.calibration = null
    console.log('[BoardPosition] Calibration cleared')
  }

  /**
   * Returns the board region for overlay placement.
   * Uses saved calibration if available, otherwise centers on cursor.
   */
  getBoardRegion(): BoardRegion {
    if (this.calibration) {
      return { ...this.calibration }
    }

    // Fallback: center on cursor
    const cursor = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursor)
    const size = Math.round(display.bounds.height * 0.5)
    return {
      x: Math.round(cursor.x - size / 2),
      y: Math.round(cursor.y - size / 2),
      width: size,
      height: size
    }
  }
}
