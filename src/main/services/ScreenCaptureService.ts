/**
 * ScreenCaptureService — Captures the game screen for tooltip OCR.
 *
 * Uses Electron's desktopCapturer to grab the primary display,
 * then crops the tooltip region based on the screen resolution.
 *
 * D4 Tooltip Position:
 *   When the inventory is open, item tooltips appear to the RIGHT
 *   of the inventory window. The tooltip is roughly in the right
 *   third of the screen, vertically centered.
 *
 * Supported resolutions:
 *   - 1920×1080 (1080p)
 *   - 2560×1440 (1440p)
 *   - 3840×2160 (4K)
 *   - Custom resolutions via proportional scaling
 */

import { desktopCapturer, screen } from 'electron'

// ============================================================
// Types
// ============================================================

/**
 * Crop region as proportions of screen dimensions (0.0 to 1.0).
 * This allows resolution-independent tooltip detection.
 */
interface CropRegion {
  /** Left edge as proportion of screen width */
  x: number
  /** Top edge as proportion of screen height */
  y: number
  /** Width as proportion of screen width */
  width: number
  /** Height as proportion of screen height */
  height: number
}

/** Result of a screen capture operation */
export interface CaptureResult {
  /** The cropped tooltip region as a PNG buffer */
  tooltipBuffer: Buffer
  /** The full screenshot as a PNG buffer (for debugging) */
  fullBuffer: Buffer
  /** Screen resolution that was detected */
  resolution: { width: number; height: number }
  /** The crop region that was used */
  cropRegion: CropRegion
}

// ============================================================
// Resolution Profiles
// ============================================================

/**
 * Tooltip crop regions for known resolutions.
 *
 * D4's UI scales with resolution but the tooltip position
 * relative to screen dimensions stays consistent. The tooltip
 * appears to the right of the inventory panel.
 *
 * These are expressed as proportions (0.0-1.0) of screen size:
 *   x: where the tooltip starts horizontally
 *   y: where the tooltip starts vertically
 *   width: how wide the tooltip region is
 *   height: how tall the tooltip region is
 */
const CROP_PROFILES: Record<string, CropRegion> = {
  // 1920×1080 — Standard HD
  '1920x1080': {
    x: 0.55,    // Tooltip starts at ~55% from left
    y: 0.12,    // Starts ~12% from top
    width: 0.38, // ~38% of screen width
    height: 0.70  // ~70% of screen height
  },
  // 2560×1440 — Quad HD
  '2560x1440': {
    x: 0.57,
    y: 0.12,
    width: 0.36,
    height: 0.68
  },
  // 3840×2160 — 4K UHD
  '3840x2160': {
    x: 0.58,
    y: 0.14,
    width: 0.34,
    height: 0.64
  }
}

/**
 * Default crop region used when the resolution doesn't match
 * any known profile. Designed to be generous (captures a larger
 * area) so the OpenCV contour detection in the sidecar can
 * isolate the actual tooltip.
 */
const DEFAULT_CROP: CropRegion = {
  x: 0.52,
  y: 0.10,
  width: 0.42,
  height: 0.75
}

// ============================================================
// ScreenCaptureService
// ============================================================

export class ScreenCaptureService {
  /**
   * Captures the primary display and crops the tooltip region.
   *
   * @returns The cropped tooltip area as a PNG buffer, plus metadata
   */
  async captureTooltip(): Promise<CaptureResult> {
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.size
    const scaleFactor = primaryDisplay.scaleFactor || 1

    // Capture the full screen
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(width * scaleFactor),
        height: Math.round(height * scaleFactor)
      }
    })

    const primarySource = sources[0]
    if (!primarySource) {
      throw new Error('No screen source found for capture')
    }

    const fullImage = primarySource.thumbnail
    const fullBuffer = fullImage.toPNG()

    // Determine the crop region based on resolution
    const resKey = `${width}x${height}`
    const cropRegion = CROP_PROFILES[resKey] || DEFAULT_CROP

    // Calculate pixel coordinates from proportions
    const actualWidth = fullImage.getSize().width
    const actualHeight = fullImage.getSize().height

    const cropX = Math.round(cropRegion.x * actualWidth)
    const cropY = Math.round(cropRegion.y * actualHeight)
    const cropW = Math.round(cropRegion.width * actualWidth)
    const cropH = Math.round(cropRegion.height * actualHeight)

    // Clamp to image bounds
    const safeX = Math.max(0, Math.min(cropX, actualWidth - 1))
    const safeY = Math.max(0, Math.min(cropY, actualHeight - 1))
    const safeW = Math.min(cropW, actualWidth - safeX)
    const safeH = Math.min(cropH, actualHeight - safeY)

    // Crop the tooltip region
    const cropped = fullImage.crop({
      x: safeX,
      y: safeY,
      width: safeW,
      height: safeH
    })

    const tooltipBuffer = cropped.toPNG()

    return {
      tooltipBuffer,
      fullBuffer,
      resolution: { width, height },
      cropRegion
    }
  }

  /**
   * Returns the crop profile for a given resolution.
   * Useful for displaying the active region in the UI.
   */
  getCropProfile(width: number, height: number): CropRegion {
    const resKey = `${width}x${height}`
    return CROP_PROFILES[resKey] || DEFAULT_CROP
  }
}
