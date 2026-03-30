/**
 * AffixCanon — Canonical affix name registry.
 *
 * Provides lookup methods to resolve raw affix name strings
 * to their canonical (official) stat name.
 *
 * Uses the alias table from affix-aliases.ts as the source of truth.
 */

import { AFFIX_ALIASES, CANONICAL_AFFIX_NAMES } from './affix-aliases'

/** Lowercase canonical names for reverse lookup */
const CANONICAL_SET = new Set(CANONICAL_AFFIX_NAMES.map(n => n.toLowerCase()))

/** Pre-built lowercase alias map for O(1) lookup */
const ALIAS_MAP = new Map<string, string>()
for (const [alias, canonical] of Object.entries(AFFIX_ALIASES)) {
  ALIAS_MAP.set(alias.toLowerCase(), canonical)
}

/**
 * Resolves a raw affix name string to its canonical name.
 *
 * Strategy:
 *   1. Check if the lowercased input is itself a canonical name
 *   2. Check the alias table for a match
 *   3. Return null if unresolvable
 *
 * @param raw - The affix name string (from OCR or build data)
 * @returns The canonical stat name, or null if not found
 */
export function resolveCanonicalName(raw: string): string | null {
  const lower = raw.toLowerCase().trim()
  if (!lower) return null

  // Direct canonical name match
  if (CANONICAL_SET.has(lower)) {
    // Return the properly-cased canonical name
    return AFFIX_ALIASES[lower] ?? CANONICAL_AFFIX_NAMES.find(n => n.toLowerCase() === lower) ?? null
  }

  // Alias lookup
  const aliased = ALIAS_MAP.get(lower)
  if (aliased) return aliased

  // Whitespace-collapsed alias lookup (handles OCR-merged words)
  const collapsed = lower.replace(/\s+/g, '')
  const collapsedMatch = ALIAS_MAP.get(collapsed)
  if (collapsedMatch) return collapsedMatch

  return null
}

/**
 * Returns all known canonical affix names.
 */
export function getAllCanonicalNames(): string[] {
  return [...CANONICAL_AFFIX_NAMES]
}
