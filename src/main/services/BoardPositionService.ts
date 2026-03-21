import { execSync } from 'child_process'
import { nativeImage } from 'electron'

/**
 * The detected board region in screen coordinates.
 */
export interface BoardRegion {
  /** Screen X of the board's top-left corner */
  x: number
  /** Screen Y of the board's top-left corner */
  y: number
  /** Width of the board region in screen pixels */
  width: number
  /** Height of the board region in screen pixels */
  height: number
}

/**
 * The game window's screen position and size.
 */
interface WindowRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * BoardPositionService detects the paragon board's position on screen.
 *
 * Strategy:
 * 1. Find the Diablo IV window's screen position via Win32 API
 * 2. Scan the captured screenshot for the distinctive red border
 * 3. Map the red border's image coordinates to screen coordinates
 *
 * The paragon board in D4 sits inside a bright red/orange glowing border
 * that is easy to detect via color thresholding.
 */
export class BoardPositionService {
  /**
   * Detects the paragon board's position on screen from a captured image.
   *
   * @param imagePath - Path to the game window screenshot
   * @returns The board region in screen coordinates, or null if not detected
   */
  detectBoardRegion(imagePath: string): BoardRegion | null {
    // Step 1: Find the game window's screen position
    const gameRect = this.findGameWindow()
    if (!gameRect) {
      console.log('[BoardPosition] Could not find Diablo IV window')
      return null
    }
    console.log(
      `[BoardPosition] Game window: (${gameRect.x}, ${gameRect.y}) ${gameRect.width}×${gameRect.height}`
    )

    // Step 2: Load the image and scan for the red border
    const image = nativeImage.createFromPath(imagePath)
    const bitmap = image.toBitmap()
    const imgSize = image.getSize()

    if (imgSize.width === 0 || imgSize.height === 0) {
      console.log('[BoardPosition] Image is empty')
      return null
    }

    const borderBox = this.detectRedBorder(bitmap, imgSize.width, imgSize.height)
    if (!borderBox) {
      console.log('[BoardPosition] Could not detect red border in image')
      return null
    }
    console.log(
      `[BoardPosition] Red border in image: (${borderBox.x}, ${borderBox.y}) ${borderBox.w}×${borderBox.h}`
    )

    // Step 3: Map image coordinates to screen coordinates
    // The image is a capture of the game window, so:
    //   screenX = gameRect.x + (borderBox.x / imgWidth) * gameRect.width
    const scaleX = gameRect.width / imgSize.width
    const scaleY = gameRect.height / imgSize.height

    const screenX = Math.round(gameRect.x + borderBox.x * scaleX)
    const screenY = Math.round(gameRect.y + borderBox.y * scaleY)
    const screenW = Math.round(borderBox.w * scaleX)
    const screenH = Math.round(borderBox.h * scaleY)

    console.log(`[BoardPosition] Board on screen: (${screenX}, ${screenY}) ${screenW}×${screenH}`)

    return { x: screenX, y: screenY, width: screenW, height: screenH }
  }

  /**
   * Finds the Diablo IV window's position and size via Win32 API.
   * Uses PowerShell to call FindWindow + GetWindowRect.
   */
  private findGameWindow(): WindowRect | null {
    try {
      const script = [
        'Add-Type -TypeDefinition @"',
        'using System;',
        'using System.Runtime.InteropServices;',
        'using System.Text;',
        'public class WinFinder {',
        '  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);',
        '  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);',
        '  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);',
        '  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);',
        '  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);',
        '  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }',
        '}',
        '"@',
        '$found = $null',
        '[WinFinder]::EnumWindows({',
        '  param($h, $l)',
        '  if ([WinFinder]::IsWindowVisible($h)) {',
        '    $sb = New-Object System.Text.StringBuilder 256',
        '    [WinFinder]::GetWindowText($h, $sb, 256) | Out-Null',
        '    $t = $sb.ToString()',
        '    if ($t -like "*Diablo*") {',
        '      $r = New-Object WinFinder.RECT',
        '      [WinFinder]::GetWindowRect($h, [ref]$r) | Out-Null',
        '      $script:found = "$($r.Left),$($r.Top),$($r.Right - $r.Left),$($r.Bottom - $r.Top)"',
        '    }',
        '  }',
        '  return $true',
        '}, [IntPtr]::Zero) | Out-Null',
        'if ($found) { Write-Output $found } else { Write-Output "null" }'
      ].join('\n')

      const result = execSync(
        `powershell -NoProfile -NonInteractive -Command "${script.replace(/"/g, '\\"')}"`,
        { encoding: 'utf-8', timeout: 5000, windowsHide: true }
      ).trim()

      if (result === 'null' || !result) return null

      const parts = result.split(',').map(Number)
      if (parts.length !== 4 || parts.some(isNaN)) return null

      return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] }
    } catch (err) {
      console.error('[BoardPosition] Failed to find game window:', err)
      return null
    }
  }

  /**
   * Scans the image pixel buffer for the paragon board's red border.
   *
   * The D4 paragon board has a distinctive bright red/orange glowing border.
   * We threshold for red-dominant pixels and find their bounding rectangle.
   *
   * @param bitmap - Raw RGBA pixel buffer from NativeImage.toBitmap()
   * @param width - Image width in pixels
   * @param height - Image height in pixels
   * @returns Bounding box of the red border, or null if not found
   */
  private detectRedBorder(
    bitmap: Buffer,
    width: number,
    height: number
  ): { x: number; y: number; w: number; h: number } | null {
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0
    let redPixelCount = 0

    // Scan every pixel — RGBA layout, 4 bytes per pixel
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4
        const r = bitmap[offset]
        const g = bitmap[offset + 1]
        const b = bitmap[offset + 2]

        // Red border detection:
        // - High red channel (> 140)
        // - Red significantly dominates green and blue
        // - Not too bright overall (eliminates white/gray)
        if (r > 140 && g < 80 && b < 80 && r > g * 2 && r > b * 2) {
          redPixelCount++
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }

    // Need a minimum number of red pixels to be confident we found the border
    // The border is a rectangle frame, so it should have many red pixels
    const minRequired = Math.min(width, height) * 2 // At least ~2 scanlines worth
    if (redPixelCount < minRequired) {
      console.log(`[BoardPosition] Only ${redPixelCount} red pixels (need ${minRequired})`)
      return null
    }

    const boxW = maxX - minX
    const boxH = maxY - minY

    // The paragon board is roughly square — reject if aspect ratio is extreme
    const aspect = boxW / boxH
    if (aspect < 0.5 || aspect > 2.0) {
      console.log(`[BoardPosition] Aspect ratio ${aspect.toFixed(2)} too extreme, not a board`)
      return null
    }

    console.log(`[BoardPosition] Found ${redPixelCount} red pixels, box: ${boxW}×${boxH}`)

    return { x: minX, y: minY, w: boxW, h: boxH }
  }
}
