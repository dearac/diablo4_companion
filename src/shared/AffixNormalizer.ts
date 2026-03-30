/**
 * AffixNormalizer — Parses raw affix strings into structured NormalizedAffix records.
 *
 * Handles both OCR-scanned affix strings (e.g., "+121 Strength [88-102]")
 * and build-data affix strings (e.g., "[133-151] Strength", "22% Attack Speed").
 *
 * Pipeline:
 *   1. Strip greater affix markers
 *   2. Extract numeric value + percent flag
 *   3. Extract roll range brackets
 *   4. Clean and normalize the stat name portion
 *   5. Resolve canonical name via AffixCanon
 *   6. If canon fails, attempt fuzzy match against known names
 */

import type { NormalizedAffix, MatchMethod } from './types'
import { resolveCanonicalName, getAllCanonicalNames } from './AffixCanon'

/** Greater affix markers that may prefix an affix string */
const GREATER_MARKERS = /^[⭐★☆*]|^Greater\s+/i

/** Leading value pattern: "+121", "+9.5%", "×12%", "13%", etc. */
const VALUE_PATTERN = /^[+×x*●•-]?\s*([\d,.]+)(%?)\s*/i

/** Leading build range: "[133-151]" */
const LEADING_RANGE = /^\[([\d.]+)\s*-\s*([\d.]+)\]\s*/

/** Trailing OCR range: "[88-102]" or truncated "[8.3-" */
const TRAILING_RANGE = /\s*\[([\d.]+)\s*-\s*([\d.]+)?\]?\s*$/

/** Complete trailing range with both numbers present */
const TRAILING_RANGE_COMPLETE = /\s*\[([\d.]+)\s*-\s*([\d.]+)\]\s*$/

/**
 * Computes Levenshtein distance between two strings.
 * Used for fuzzy fallback matching.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

/**
 * Normalizes a raw affix string into a structured NormalizedAffix.
 *
 * @param raw - The raw affix string from OCR or build data
 * @returns A NormalizedAffix with canonical name, value, range, and confidence
 */
export function normalizeAffix(raw: string): NormalizedAffix {
  let working = raw.trim()

  // Step 1: Strip greater affix markers
  working = working.replace(GREATER_MARKERS, '').trim()

  // Step 2: Extract leading range (build format: "[133-151] Strength")
  let range: [number, number] | null = null
  const leadingMatch = working.match(LEADING_RANGE)
  if (leadingMatch) {
    range = [parseFloat(leadingMatch[1]), parseFloat(leadingMatch[2])]
    working = working.replace(LEADING_RANGE, '').trim()
  }

  // Step 3: Extract numeric value
  let value: number | null = null
  let isPercent = false
  const valueMatch = working.match(VALUE_PATTERN)
  if (valueMatch) {
    value = parseFloat(valueMatch[1].replace(',', ''))
    isPercent = valueMatch[2] === '%'
    working = working.replace(VALUE_PATTERN, '').trim()
  }

  // Step 4: Extract trailing range (OCR format: "[88-102]" or truncated "[8.3-")
  if (!range) {
    const trailingComplete = working.match(TRAILING_RANGE_COMPLETE)
    if (trailingComplete) {
      range = [parseFloat(trailingComplete[1]), parseFloat(trailingComplete[2])]
    }
    // Strip trailing range (complete or truncated) from the name
    working = working.replace(TRAILING_RANGE, '').trim()
  }

  // Step 5: Clean the stat name
  const statName = working.trim()

  // Step 6: Resolve canonical name
  let canonicalName: string | null = null
  let matchMethod: MatchMethod = 'unresolved'
  let confidence = 0

  if (statName) {
    // Try canon resolution (exact or alias)
    const resolved = resolveCanonicalName(statName)
    if (resolved) {
      canonicalName = resolved
      // Determine if it was exact or alias
      matchMethod = statName.toLowerCase() === resolved.toLowerCase() ? 'exact' : 'alias'
      confidence = matchMethod === 'exact' ? 1.0 : 0.9
    } else {
      // Fuzzy fallback: Levenshtein ≤ 2 against canonical names
      const lowerName = statName.toLowerCase()
      let bestDist = Infinity
      let bestMatch: string | null = null

      for (const canon of getAllCanonicalNames()) {
        const dist = levenshtein(lowerName, canon.toLowerCase())
        if (dist < bestDist) {
          bestDist = dist
          bestMatch = canon
        }
      }

      if (bestDist <= 2 && bestMatch) {
        canonicalName = bestMatch
        matchMethod = 'fuzzy'
        confidence = bestDist === 0 ? 1.0 : bestDist === 1 ? 0.65 : 0.5
      }
    }
  }

  return {
    raw,
    canonicalName,
    value,
    isPercent,
    range,
    confidence,
    matchMethod
  }
}
