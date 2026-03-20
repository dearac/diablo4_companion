import { desktopCapturer, screen } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'

/**
 * ScreenCaptureService captures the screen and crops the tooltip region.
 *
 * Uses Electron's desktopCapturer to grab the full primary display,
 * then crops a region around the mouse cursor where the tooltip appears.
 * Diablo 4 tooltips render to the left of the cursor, roughly 500×900px.
 */

/** Tooltip crop dimensions (generous to avoid clipping long tooltips) */
const TOOLTIP_WIDTH = 620
const TOOLTIP_HEIGHT = 1200

/**
 * How far left of the cursor the crop region starts.
 * The tooltip is fully to the left of the mouse, so we offset
 * by the full width plus a small margin.
 */
const CURSOR_LEFT_OFFSET = 640

/**
 * Vertical offset above the cursor. The tooltip extends both above
 * and below the cursor, but mostly below. We start 350px above
 * to capture headers on items with long tooltip bodies.
 */
const CURSOR_TOP_OFFSET = 350

export class ScreenCaptureService {
  private scansDir: string

  constructor(scansDir: string) {
    this.scansDir = scansDir
  }

  /**
   * Captures the primary display, crops the tooltip region around
   * the cursor, and saves it as a JPEG.
   *
   * @returns Absolute path to the saved screenshot.
   */
  async captureScreen(): Promise<string> {
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.size
    const scaleFactor = primaryDisplay.scaleFactor

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height }
    })

    if (sources.length === 0) {
      throw new Error('No screen source available for capture')
    }

    const thumbnail = sources[0].thumbnail
    const imageSize = thumbnail.getSize()

    // Get cursor position (in display coordinates)
    const cursor = screen.getCursorScreenPoint()

    // Convert to image coordinates (handle DPI scaling)
    const scaleX = imageSize.width / (width * scaleFactor)
    const scaleY = imageSize.height / (height * scaleFactor)
    const cursorImgX = Math.round(cursor.x * scaleX)
    const cursorImgY = Math.round(cursor.y * scaleY)

    // Calculate crop region: tooltip is to the LEFT of the cursor
    const scaledW = Math.round(TOOLTIP_WIDTH * scaleX)
    const scaledH = Math.round(TOOLTIP_HEIGHT * scaleY)

    // Diablo 4 will shift the tooltip ABOVE the cursor if it doesn't fit below it.
    // If we assume a typical tooltip might extend ~700px below the cursor:
    let topOffset = CURSOR_TOP_OFFSET
    if (cursorImgY + (TOOLTIP_HEIGHT - CURSOR_TOP_OFFSET) * scaleY > imageSize.height) {
      // Tooltip will be drawn upwards. Bias the offset to capture above the cursor.
      topOffset = TOOLTIP_HEIGHT - 50 // Almost all of the bounding box is above the cursor
    }

    let cropX = cursorImgX - Math.round(CURSOR_LEFT_OFFSET * scaleX)
    let cropY = cursorImgY - Math.round(topOffset * scaleY)

    // Clamp to keep the full crop dimensions inside the image.
    cropX = Math.max(0, Math.min(cropX, imageSize.width - scaledW))
    cropY = Math.max(0, Math.min(cropY, imageSize.height - scaledH))

    const cropW = Math.min(scaledW, imageSize.width - cropX)
    const cropH = Math.min(scaledH, imageSize.height - cropY)

    console.log(
      `[SCAN] Cursor: (${cursor.x}, ${cursor.y}) → crop: (${cropX}, ${cropY}, ${cropW}×${cropH})`
    )

    // Crop the tooltip region
    const cropped = thumbnail.crop({ x: cropX, y: cropY, width: cropW, height: cropH })
    const jpegBuffer = cropped.toJPEG(90)

    const filename = `scan-${Date.now()}.jpg`
    const filePath = join(this.scansDir, filename)
    await writeFile(filePath, jpegBuffer)

    return filePath
  }
}
