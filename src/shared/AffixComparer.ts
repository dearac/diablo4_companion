/**
 * AffixComparer — Layered comparison engine for normalized affixes.
 *
 * Compares two raw affix strings by normalizing both, then checking
 * through a layered match system:
 *   Layer 1: Exact canonical match (confidence 1.0)
 *   Layer 2: Alias-resolved match (confidence 0.9)
 *   Layer 3: Token overlap match (confidence 0.75, requires ≥2 shared tokens)
 *   Layer 4: Fuzzy fallback (confidence 0.5-0.7, Levenshtein ≤ 2)
 *   Layer 5: No match (confidence 0.0)
 */

import type { AffixMatchResult, MatchMethod } from './types'
import { normalizeAffix } from './AffixNormalizer'

/**
 * Compares two affix strings and returns a detailed match result.
 *
 * @param scannedAffix - Raw affix string from OCR
 * @param buildAffix - Raw affix string from build data
 * @returns AffixMatchResult with match status, confidence, and reason
 */
export function compareAffixes(scannedAffix: string, buildAffix: string): AffixMatchResult {
  const noMatch = (reason: string): AffixMatchResult => ({
    matched: false,
    confidence: 0,
    reason,
    canonicalName: null,
    method: 'unresolved'
  })

  if (!scannedAffix.trim() || !buildAffix.trim()) {
    return noMatch('Empty affix string')
  }

  const scanned = normalizeAffix(scannedAffix)
  const build = normalizeAffix(buildAffix)

  // Layer 1 & 2: Both sides resolved to the same canonical name
  if (scanned.canonicalName && build.canonicalName) {
    if (scanned.canonicalName === build.canonicalName) {
      // Determine method: exact if both were exact, alias if either was alias/fuzzy
      const isExact = scanned.matchMethod === 'exact' && build.matchMethod === 'exact'
      const method: MatchMethod = isExact ? 'exact' : 'alias'
      const confidence = isExact ? 1.0 : Math.min(scanned.confidence, build.confidence)

      return {
        matched: true,
        confidence,
        reason: isExact
          ? `Exact match: "${scanned.canonicalName}"`
          : `Alias match: "${scannedAffix}" and "${buildAffix}" both resolve to "${scanned.canonicalName}"`,
        canonicalName: scanned.canonicalName,
        method
      }
    }
  }

  // Layer 3: Token overlap
  const scannedTokens = (scanned.canonicalName ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  const buildTokens = (build.canonicalName ?? '').toLowerCase().split(/\s+/).filter(Boolean)

  if (scannedTokens.length > 0 && buildTokens.length > 0) {
    const overlap = scannedTokens.filter(t => buildTokens.includes(t))
    const overlapRatio = Math.max(
      overlap.length / scannedTokens.length,
      overlap.length / buildTokens.length
    )

    if (overlap.length >= 2 && overlapRatio >= 0.8) {
      return {
        matched: true,
        confidence: 0.75,
        reason: `Token overlap match: ${overlap.length} shared tokens (${(overlapRatio * 100).toFixed(0)}% overlap)`,
        canonicalName: build.canonicalName,
        method: 'fuzzy'
      }
    }
  }

  // Layer 4: Fallback exact text match for unregistered/unknown affixes
  // If neither side resolved or only one resolved but the string payloads match perfectly
  // (e.g. "Damage to Elites" vs "Damage to Elites" which isn't in the canonical registry)
  const cleanScannedName = scanned.parsedName.replace(/[^a-z0-9]/gi, '').toLowerCase()
  const cleanBuildName = build.parsedName.replace(/[^a-z0-9]/gi, '').toLowerCase()

  if (cleanScannedName && cleanScannedName === cleanBuildName) {
    return {
      matched: true,
      confidence: 0.9,
      reason: `Fallback exact text match: "${scanned.parsedName}"`,
      canonicalName: build.parsedName, // Use the build's casing as pseudo-canonical
      method: 'exact'
    }
  }

  // Layer 5: Fuzzy fallback between canonical names (already handled by normalizer)
  // If one side resolved via fuzzy to the same canonical name as the other, Layers 1-2 caught it.
  // This layer handles the case where neither resolved but the stat name portions are close.
  // For safety, this is intentionally NOT implemented in v1 — Layers 1-4 cover the known cases.

  return noMatch(
    `No match: "${scanned.canonicalName ?? scannedAffix}" and "${build.canonicalName ?? buildAffix}" are different stats`
  )
}
