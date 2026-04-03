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
const TOOLTIP_WIDTH = 550
const TOOLTIP_HEIGHT = 1200

/**
 * How far left of the cursor the crop region starts.
 * The tooltip is fully to the left of the mouse, so we offset
 * by the full width plus a small margin.
 */
const CURSOR_LEFT_OFFSET = 570

/**
 * Vertical offset above the cursor. Now that we have geometric OcrFilter,
 * we can capture widely. A 600px offset perfectly centers the 1200px crop
 * over the cursor, ensuring we never miss the item name on tall tooltips.
 */
const CURSOR_TOP_OFFSET = 600

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
  async captureScreen(): Promise<{
    filePath: string
    crop: { x: number; y: number; scaleX: number; scaleY: number }
  }> {
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.size

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height }
    })

    if (sources.length === 0) {
      throw new Error('No screen source available for capture')
    }

    const thumbnail = sources[0].thumbnail
    const imageSize = thumbnail.getSize()

    // Get cursor position (in display coordinates - logical pixels)
    const cursor = screen.getCursorScreenPoint()

    // Real scale between logical screen and captured image.
    // desktopCapturer returns physical pixels (e.g. 3840), width is logical (e.g. 2560).
    const scaleX = imageSize.width / width
    const scaleY = imageSize.height / height

    const cursorImgX = Math.round(cursor.x * scaleX)
    const cursorImgY = Math.round(cursor.y * scaleY)

    // Calculate crop region: tooltip is to the LEFT of the cursor
    // TOOLTIP_WIDTH is defined in logical pixels, convert to physical for crop
    const scaledW = Math.round(TOOLTIP_WIDTH * scaleX)
    const scaledH = Math.round(TOOLTIP_HEIGHT * scaleY)

    // Diablo 4 pushes tooltips upwards if they would fall off the bottom of the screen.
    let topOffset = CURSOR_TOP_OFFSET
    if (cursorImgY + (TOOLTIP_HEIGHT - CURSOR_TOP_OFFSET) * scaleY > imageSize.height) {
      topOffset = TOOLTIP_HEIGHT - 50 // Almost all bounding box is above the cursor
    }

    let cropX = cursorImgX - Math.round(CURSOR_LEFT_OFFSET * scaleX)
    let cropY = cursorImgY - Math.round(topOffset * scaleY)

    // Clamp to keep the full crop dimensions inside the image.
    cropX = Math.max(0, Math.min(cropX, imageSize.width - scaledW))
    cropY = Math.max(0, Math.min(cropY, imageSize.height - scaledH))

    const cropW = Math.min(scaledW, imageSize.width - cropX)
    const cropH = Math.min(scaledH, imageSize.height - cropY)

    console.log(
      `[SCAN] Cursor: (${cursor.x}, ${cursor.y}) → crop: (${cropX}, ${cropY}, ${cropW}×${cropH}) scale: ${scaleX.toFixed(2)}x`
    )

    // Crop the tooltip region
    const cropped = thumbnail.crop({ x: cropX, y: cropY, width: cropW, height: cropH })
    const jpegBuffer = cropped.toJPEG(90)

    const filename = `scan-${Date.now()}.jpg`
    const filePath = join(this.scansDir, filename)
    await writeFile(filePath, jpegBuffer)

    return {
      filePath,
      crop: { x: cropX, y: cropY, scaleX, scaleY }
    }
  }

  /**
   * Captures the Diablo IV game window for board scanning.
   *
   * Tries to find the game window by title first (handles windowed mode).
   * Falls back to full-screen capture if the game window isn't found.
   *
   * @returns Absolute path to the saved screenshot.
   */
  async captureFullScreen(): Promise<{
    filePath: string
    crop: { x: number; y: number; scaleX: number; scaleY: number }
  }> {
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.size

    // Try to capture just the Diablo IV window first
    const windowSources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width, height }
    })

    // Look for the game window by title (case-insensitive partial match)
    const gameWindow = windowSources.find((s) => s.name.toLowerCase().includes('diablo'))

    if (gameWindow) {
      console.log(`[BoardScan] Found game window: "${gameWindow.name}"`)
      const thumbnail = gameWindow.thumbnail
      const jpegBuffer = thumbnail.toJPEG(90)

      const filename = `board-scan-${Date.now()}.jpg`
      const filePath = join(this.scansDir, filename)
      await writeFile(filePath, jpegBuffer)

      return { filePath, crop: { x: 0, y: 0, scaleX: 1, scaleY: 1 } }
    }

    // Fallback: capture the entire screen if game window not found
    console.log('[BoardScan] Game window not found, falling back to full-screen capture')
    const screenSources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height }
    })

    if (screenSources.length === 0) {
      throw new Error('No screen source available for capture')
    }

    const thumbnail = screenSources[0].thumbnail
    const jpegBuffer = thumbnail.toJPEG(90)

    const filename = `board-scan-${Date.now()}.jpg`
    const filePath = join(this.scansDir, filename)
    await writeFile(filePath, jpegBuffer)

    return { filePath, crop: { x: 0, y: 0, scaleX: 1, scaleY: 1 } }
  }
}
