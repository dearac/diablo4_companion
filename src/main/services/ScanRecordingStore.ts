/**
 * ScanRecordingStore — Persists scan recordings for offline replay testing.
 *
 * Each recording is stored in its own timestamped directory:
 *   data/scan-recordings/<timestamp>/
 *     screenshot.png    — the actual screenshot
 *     recording.json    — the full ScanRecording data
 */

import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, copyFileSync } from 'fs'
import { join } from 'path'
import type { ScanRecording } from '../../shared/types'

export class ScanRecordingStore {
  private baseDir: string

  constructor(baseDir: string) {
    this.baseDir = baseDir
    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true })
    }
  }

  /**
   * Saves a scan recording with its screenshot.
   *
   * @param data - The recording data (without id/timestamp, auto-generated)
   * @param screenshotSourcePath - Path to the screenshot to copy into the recording
   * @returns The saved ScanRecording with generated id and timestamp
   */
  save(
    data: Omit<ScanRecording, 'id' | 'timestamp'>,
    screenshotSourcePath: string
  ): ScanRecording {
    const now = new Date()
    const id = now.toISOString().replace(/[:.]/g, '-')
    const timestamp = now.toISOString()
    const recordingDir = join(this.baseDir, id)

    mkdirSync(recordingDir, { recursive: true })

    // Copy screenshot into the recording directory
    const screenshotDest = join(recordingDir, 'screenshot.png')
    if (existsSync(screenshotSourcePath)) {
      copyFileSync(screenshotSourcePath, screenshotDest)
    }

    const recording: ScanRecording = {
      ...data,
      id,
      timestamp,
      screenshotPath: 'screenshot.png'  // relative to recording dir
    }

    // Write recording JSON
    const jsonPath = join(recordingDir, 'recording.json')
    writeFileSync(jsonPath, JSON.stringify(recording, null, 2), 'utf-8')

    return recording
  }

  /**
   * Lists all saved recordings, sorted newest first.
   */
  list(): ScanRecording[] {
    if (!existsSync(this.baseDir)) return []

    const dirs = readdirSync(this.baseDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort()
      .reverse()

    const recordings: ScanRecording[] = []
    for (const dir of dirs) {
      const jsonPath = join(this.baseDir, dir, 'recording.json')
      if (existsSync(jsonPath)) {
        try {
          const data = JSON.parse(readFileSync(jsonPath, 'utf-8')) as ScanRecording
          recordings.push(data)
        } catch {
          // Skip corrupted files
        }
      }
    }

    return recordings
  }

  /**
   * Loads a single recording by ID.
   */
  get(id: string): ScanRecording | null {
    const jsonPath = join(this.baseDir, id, 'recording.json')
    if (!existsSync(jsonPath)) return null
    try {
      return JSON.parse(readFileSync(jsonPath, 'utf-8')) as ScanRecording
    } catch {
      return null
    }
  }
}
