/**
 * AffixMatcher — Backwards-compatible affix matching API.
 *
 * This module preserves the original `affixMatches()` function signature
 * used by 6 consumers across the codebase. Internally, it now delegates
 * to the canonical normalization + layered comparison pipeline.
 *
 * For rich match results (confidence, reason, canonical name),
 * use `compareAffixes()` from AffixComparer directly.
 */

import { compareAffixes } from './AffixComparer'
import type { AffixMatchResult } from './types'

/**
 * Checks if a scanned affix string matches a build-expected affix name.
 *
 * Backwards-compatible boolean API. Internally uses canonical normalization.
 *
 * @param scannedAffix - The raw affix string from OCR
 * @param buildAffixName - The affix name from build data
 * @returns true if they refer to the same stat
 */
export function affixMatches(scannedAffix: string, buildAffixName: string): boolean {
  return compareAffixes(scannedAffix, buildAffixName).matched
}

/**
 * Rich comparison — returns full match details with confidence and reason.
 *
 * @param scannedAffix - The raw affix string from OCR
 * @param buildAffixName - The affix name from build data
 * @returns AffixMatchResult with match status, confidence, reason, and canonical name
 */
export function affixMatchDetails(scannedAffix: string, buildAffixName: string): AffixMatchResult {
  return compareAffixes(scannedAffix, buildAffixName)
}
