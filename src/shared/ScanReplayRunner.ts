/**
 * ScanReplayRunner — Replays saved scan recordings through the current pipeline.
 *
 * Used for regression testing: after changing the normalizer or comparer,
 * replay recorded scans to detect changes in behavior.
 */

import type { ScanRecording, ReplayResult, ScanVerdict, ScannedGearPiece } from './types'
import { parseTooltip } from '../main/services/GearParser'
import { compareGear } from './GearComparer'

/**
 * Replays a single scan recording through the current pipeline.
 *
 * @param recording - A saved ScanRecording from a live game session
 * @returns ReplayResult with reparsed item, new verdict, and diffs
 */
export function replayScan(recording: ScanRecording): ReplayResult {
  // Re-parse OCR lines through current GearParser
  const reparsedItem: ScannedGearPiece = parseTooltip(recording.ocrLines)

  // Re-run comparison if build slot was available
  let newVerdict: ScanVerdict | null = null
  if (recording.buildSlot) {
    newVerdict = compareGear(reparsedItem, recording.buildSlot)
  }

  // Diff old vs new
  const diffs = diffVerdicts(recording.verdict, newVerdict)

  return { recording, reparsedItem, newVerdict, diffs }
}

/**
 * Replays all recordings and returns results.
 */
export function replayAll(recordings: ScanRecording[]): ReplayResult[] {
  return recordings.map(replayScan)
}

/**
 * Computes human-readable diffs between two verdicts.
 */
function diffVerdicts(old: ScanVerdict | null, current: ScanVerdict | null): string[] {
  const diffs: string[] = []

  if (!old && !current) return diffs
  if (!old || !current) {
    if (old && !current) diffs.push('Verdict was present, now missing')
    if (!old && current) diffs.push('Verdict was missing, now present')
    return diffs
  }

  if (old.verdict !== current.verdict) {
    diffs.push(`Verdict changed: ${old.verdict} → ${current.verdict}`)
  }

  if (old.buildMatchCount !== current.buildMatchCount) {
    diffs.push(`Match count changed: ${old.buildMatchCount} → ${current.buildMatchCount}`)
  }

  // Check for newly matched/unmatched affixes
  const oldMatched = new Set(old.matchedAffixes)
  const curMatched = new Set(current.matchedAffixes)

  for (const m of curMatched) {
    if (!oldMatched.has(m)) diffs.push(`New match: "${m}"`)
  }
  for (const m of oldMatched) {
    if (!curMatched.has(m)) diffs.push(`Lost match: "${m}"`)
  }

  return diffs
}
