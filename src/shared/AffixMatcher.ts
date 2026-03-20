/**
 * AffixMatcher — Shared fuzzy matching logic for comparing OCR-scanned
 * affix strings against build-expected affix names.
 *
 * Handles mismatches between how d4builds stores affix names
 * (e.g., "[133-151] Strength", "13% Critical Strike Chance")
 * and how OCR reads them from tooltips
 * (e.g., "+121 Strength [88-102]", "+9.5% Attack Speed [8.3-").
 */

/**
 * Strips leading value range brackets from a build affix name.
 * "[133-151] Strength" → "Strength"
 * "13% Critical Strike Chance" → "13% Critical Strike Chance" (no bracket, unchanged)
 */
function stripBuildRange(name: string): string {
  return name.replace(/^\[[\d.%-]+\]\s*/, '').trim()
}

/**
 * Strips numeric value prefixes from an affix string.
 * "+121 Strength" → "Strength"
 * "+9.5% Attack Speed" → "Attack Speed"
 * "13% Critical Strike Chance" → "Critical Strike Chance"
 */
function stripNumericPrefix(affix: string): string {
  return affix.replace(/^[+×x*●•-]?\s*[\d,.]+%?\s*/, '').trim()
}

/**
 * Checks if a scanned affix string matches a build-expected affix name.
 *
 * Uses multiple strategies:
 *   1. Direct case-insensitive substring match (either direction)
 *   2. Stripped-name comparison (remove numbers/ranges, compare stat names)
 *
 * @param scannedAffix - The raw affix string from OCR
 * @param buildAffixName - The affix name from build data
 * @returns true if they refer to the same stat
 */
export function affixMatches(scannedAffix: string, buildAffixName: string): boolean {
  const scanLower = scannedAffix.toLowerCase()
  const buildLower = buildAffixName.toLowerCase()

  // Strategy 1: Direct substring match
  if (scanLower.includes(buildLower) || buildLower.includes(scanLower)) {
    return true
  }

  // Strategy 2: Compare just the stat name portion (strip all numbers/ranges)
  const scanName = stripNumericPrefix(scannedAffix).toLowerCase()
  const buildName = stripNumericPrefix(stripBuildRange(buildAffixName)).toLowerCase()

  if (scanName && buildName) {
    // Remove trailing range brackets from OCR like "[8.3 -" or "[244 - 272]"
    const cleanScanName = scanName.replace(/\s*\[[\d.\s-]*\]?\s*$/, '').trim()
    if (cleanScanName.includes(buildName) || buildName.includes(cleanScanName)) {
      return true
    }
  }

  return false
}
