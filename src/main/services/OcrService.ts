import { execFile } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'

/**
 * OcrService spawns WinOcr.exe and returns parsed OCR results.
 *
 * WinOcr.exe is a C# console app that calls the Windows.Media.Ocr API
 * and outputs JSON to stdout. This service manages spawning it,
 * collecting the output, and parsing the JSON.
 */

/** Shape of a single word returned by WinOcr.exe */
export interface OcrWord {
  text: string
  bbox: { x: number; y: number; w: number; h: number }
}

/** Shape of a single line returned by WinOcr.exe */
export interface OcrLine {
  text: string
  words: OcrWord[]
}

/** Full OCR result from WinOcr.exe */
export interface OcrResult {
  text: string
  lines: OcrLine[]
}

/**
 * Parses the raw stdout string from WinOcr.exe into a typed OcrResult.
 * Exported for unit testing without needing the actual .exe.
 */
export function parseOcrOutput(raw: string): OcrResult {
  if (!raw || raw.trim().length === 0) {
    throw new Error('OCR output is empty')
  }

  try {
    const parsed = JSON.parse(raw)
    return {
      text: parsed.text ?? '',
      lines: (parsed.lines ?? []).map((line: Record<string, unknown>) => ({
        text: (line.text as string) ?? '',
        words: ((line.words as Record<string, unknown>[]) ?? []).map(
          (word: Record<string, unknown>) => ({
            text: (word.text as string) ?? '',
            bbox: {
              x: (word.bbox as Record<string, number>)?.x ?? 0,
              y: (word.bbox as Record<string, number>)?.y ?? 0,
              w: (word.bbox as Record<string, number>)?.w ?? 0,
              h: (word.bbox as Record<string, number>)?.h ?? 0
            }
          })
        )
      }))
    }
  } catch {
    throw new Error(`Failed to parse OCR output: ${raw.substring(0, 100)}`)
  }
}

/**
 * Runs WinOcr.exe on the given image file and returns parsed OCR results.
 *
 * @param imagePath - Absolute path to the .png screenshot
 * @param sidecarDir - Path to the sidecar/bin/ directory containing WinOcr.exe
 * @returns Parsed OCR result with text and line/word bounding boxes
 */
export function runOcr(imagePath: string, sidecarDir: string): Promise<OcrResult> {
  return new Promise((resolve, reject) => {
    const exePath = join(sidecarDir, 'WinOcr.exe')

    // Pre-flight: make sure the binary actually exists before spawning
    if (!existsSync(exePath)) {
      reject(
        new Error(
          `WinOcr.exe not found at: ${exePath}. ` +
            'Ensure the sidecar/bin/ directory is bundled with the app.'
        )
      )
      return
    }

    execFile(
      exePath,
      [imagePath, '--lang', 'en-US'],
      {
        timeout: 15000,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`OCR failed (${exePath}): ${stderr || error.message}`))
          return
        }

        try {
          resolve(parseOcrOutput(stdout))
        } catch (parseError) {
          reject(parseError)
        }
      }
    )
  })
}

