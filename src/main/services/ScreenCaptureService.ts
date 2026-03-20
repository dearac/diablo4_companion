import { desktopCapturer, screen } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'

/**
 * ScreenCaptureService captures the current screen to a PNG file.
 *
 * Uses Electron's desktopCapturer to grab the full primary display.
 * The screenshot is saved as a temporary .png file in the data/scans/ directory.
 */
export class ScreenCaptureService {
  private scansDir: string

  constructor(scansDir: string) {
    this.scansDir = scansDir
  }

  /**
   * Captures the primary display and saves it as a temp PNG.
   * @returns Absolute path to the saved screenshot.
   */
  async captureScreen(): Promise<string> {
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
    const pngBuffer = thumbnail.toPNG()

    const filename = `scan-${Date.now()}.png`
    const filePath = join(this.scansDir, filename)
    await writeFile(filePath, pngBuffer)

    return filePath
  }
}
