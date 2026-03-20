import type { ScannedGearPiece } from '../../shared/types'

/**
 * GearParser converts raw OCR text lines from a Diablo 4 tooltip
 * into a structured ScannedGearPiece.
 *
 * Tooltip layout (typical):
 *   Line 0: Item Name (e.g., "Harlequin Crest")
 *   Line 1: Item Type + Slot (e.g., "Unique Helm", "Legendary Chest Armor")
 *   Line 2: Item Power (e.g., "925 Item Power")
 *   Lines 3+: Affixes, sockets, aspect, etc.
 */

/**
 * All known gear slots, sorted longest-first for greedy matching.
 * When the OCR reads "Legendary Chest Armor", we want to match
 * "Chest Armor" before "Chest".
 */
const GEAR_SLOTS = [
  'Chest Armor',
  'Two-Handed Sword',
  'Two-Handed Mace',
  'Two-Handed Axe',
  'Two-Handed Scythe',
  'Two-Handed Staff',
  'Helm',
  'Gloves',
  'Pants',
  'Boots',
  'Amulet',
  'Ring',
  'Shield',
  'Focus',
  'Totem',
  'Sword',
  'Mace',
  'Axe',
  'Dagger',
  'Scythe',
  'Wand',
  'Crossbow',
  'Bow',
  'Polearm',
  'Staff'
].sort((a, b) => b.length - a.length)

/** Item type keywords that appear before the slot name */
const ITEM_TYPES: Array<{ keyword: string; type: ScannedGearPiece['itemType'] }> = [
  { keyword: 'Unique', type: 'Unique' },
  { keyword: 'Legendary', type: 'Legendary' },
  { keyword: 'Rare', type: 'Rare' }
]

/** Regex to extract item power from lines like "925 Item Power" or "1000 iP" */
const ITEM_POWER_REGEX = /(\d{3,4})\s*(?:Item\s*Power|iP|IP)/i

/** Regex to detect socket lines like "Socket (1)" or "Sockets (2)" or "Empty Socket" */
const SOCKET_REGEX = /Sockets?\s*(?:\((\d+)\)|(\d+))?/i

/** Regex to detect additive affixes like "+15.5% Crit Chance" */
const ADDITIVE_AFFIX_REGEX = /^[+]\s*[\d.]+%?\s+.+/

/** Regex to detect multiplicative affixes like "×12% Vulnerable Damage" */
const MULTIPLICATIVE_AFFIX_REGEX = /^[×x]\s*[\d.]+%?\s+.+/i

/** Greater affix marker — star emoji or "Greater" prefix */
const GREATER_AFFIX_MARKERS = ['⭐', '★', '☆', 'Greater']

/**
 * Parses an array of OCR text lines from a tooltip into a ScannedGearPiece.
 *
 * @param lines - Array of text strings, one per OCR-detected line
 * @returns A structured ScannedGearPiece with all extractable fields
 */
export function parseTooltip(lines: string[]): ScannedGearPiece {
  const result: ScannedGearPiece = {
    slot: 'Unknown',
    itemName: '',
    itemType: 'Legendary',
    itemPower: 0,
    affixes: [],
    implicitAffixes: [],
    temperedAffixes: [],
    greaterAffixes: [],
    sockets: 0,
    socketContents: [],
    aspect: null,
    rawText: lines.join('\n')
  }

  // ---- Find the tooltip within the full-screen OCR output ----
  // The type+slot line (e.g., "Unique Shield", "Legendary Ring") is the anchor.
  //
  // Problem: Slot names like "Shield" can appear in affix text (e.g.,
  // "Blessed Shield deals..."). We solve this with a two-pass approach:
  //   1. First pass: High-confidence — line must contain BOTH a rarity
  //      keyword (Unique/Legendary/Rare/Ancestral/Bloodied) AND a slot name.
  //   2. Second pass: Low-confidence fallback — line contains just a slot name.
  //      Only used if pass 1 finds nothing.
  let typeSlotLineIndex = -1
  const searchLimit = Math.min(20, lines.length)

  /** Rarity/type keywords that appear on the type+slot line */
  const TYPE_KEYWORDS = ['Unique', 'Legendary', 'Rare', 'Ancestral', 'Bloodied']

  /**
   * Returns true if a line should be skipped during the slot search
   * (affix lines, item power, noise, etc.).
   */
  const shouldSkipLine = (line: string): boolean => {
    if (/^[+×x*●•-]\s*[\d.]/.test(line)) return true
    if (ITEM_POWER_REGEX.test(line)) return true
    if (/(?:^\d|,|Armor)/i.test(line) && !/Chest Armor/i.test(line)) return true
    if (/^(?:CHARACTER|EQUIPPED|Stats|Materials|Equipment|Weapon\s+Dam)/i.test(line)) return true
    if (line.length <= 2) return true
    return false
  }

  // Pass 1: Find a line with BOTH a type keyword AND a slot name
  for (let i = 0; i < searchLimit; i++) {
    const line = lines[i].trim()
    if (shouldSkipLine(line)) continue

    const upper = line.toUpperCase()
    const hasTypeKeyword = TYPE_KEYWORDS.some((kw) => upper.includes(kw.toUpperCase()))
    if (!hasTypeKeyword) continue

    for (const slot of GEAR_SLOTS) {
      if (upper.includes(slot.toUpperCase())) {
        result.slot = slot
        typeSlotLineIndex = i
        break
      }
    }
    if (typeSlotLineIndex >= 0) break
  }

  // Pass 2 fallback: If no type+slot combo found, accept slot-only match
  // Search forward (first occurrence is more reliable than last)
  if (typeSlotLineIndex < 0) {
    for (let i = 0; i < searchLimit; i++) {
      const line = lines[i].trim()
      if (shouldSkipLine(line)) continue

      const upper = line.toUpperCase()
      for (const slot of GEAR_SLOTS) {
        if (upper.includes(slot.toUpperCase())) {
          result.slot = slot
          typeSlotLineIndex = i
          break
        }
      }
      if (typeSlotLineIndex >= 0) break
    }
  }

  // Look for rarity/type on the same line or the line above
  if (typeSlotLineIndex >= 0) {
    const searchLines = [lines[typeSlotLineIndex]]
    if (typeSlotLineIndex > 0) searchLines.push(lines[typeSlotLineIndex - 1])

    for (const line of searchLines) {
      const upper = line.toUpperCase()
      for (const typeInfo of ITEM_TYPES) {
        if (upper.includes(typeInfo.keyword.toUpperCase())) {
          result.itemType = typeInfo.type
          break
        }
      }
    }
  }

  // ---- Item Name: line(s) immediately above the type+slot line ----
  // D4 item names can span 1–3 OCR lines (e.g., "VULGAR CHAIN" / "OF CELESTIAL" / "STRIFE")
  if (typeSlotLineIndex > 0) {
    const nameLineCandidates: string[] = []
    const maxLookback = Math.min(6, typeSlotLineIndex)

    for (let offset = 1; offset <= maxLookback; offset++) {
      const candidate = lines[typeSlotLineIndex - offset].trim()

      // STOP conditions (we reached above the name — character panel area)
      if (
        /^(?:EQUIPPED|CHARACTER)$/i.test(candidate) ||
        /Title\s*Selected/i.test(candidate) || // "No Title Selected"
        /^Is$/i.test(candidate)
      ) {
        break
      }

      // SKIP conditions (junk between name and slot, or crop noise)
      if (
        candidate.length === 0 ||
        candidate.length >= 35 ||
        candidate.length <= 3 || // Very short garbage ("cted", "3,", "8)")
        /^[+×x]\s*[\d.]/.test(candidate) || // Affix line
        /^\d{3,4}\s/.test(candidate) || // Item power
        /Item Power/i.test(candidate) ||
        /Quality/i.test(candidate) ||
        /(?:^\d|,|Armor)/i.test(candidate) ||
        /Armory/i.test(candidate) ||
        /Loadout/i.test(candidate) ||
        /Slot\s*Transmog/i.test(candidate) || // "Slot Transmog: ON"
        /^Ed\s*Slot/i.test(candidate) || // Partial "Ed Slot" from crop
        /^ON$/i.test(candidate) || // "ON" from Transmog toggle
        /^\d+$/.test(candidate) || // Pure numbers like "163>"
        /^[^a-zA-Z]*$/.test(candidate) // Lines with no letters (pure garbage)
      ) {
        continue // Skip this line, keep going up
      }

      // SKIP rarity descriptor lines like "Ancestral Bloodied Unique",
      // "Legendary", "Rare", etc. These sit between the slot line and the name.
      const candidateUpper = candidate.toUpperCase()
      const isRarityLine = ['UNIQUE', 'LEGENDARY', 'RARE', 'ANCESTRAL', 'BLOODIED'].some((kw) =>
        candidateUpper.includes(kw)
      )
      if (isRarityLine) {
        continue // Skip rarity descriptors, name is above
      }

      // If we didn't skip or stop, it's a name line!
      nameLineCandidates.unshift(candidate)

      // D4 item names span at most 3 OCR lines — stop once we have enough
      if (nameLineCandidates.length >= 3) break
    }

    result.itemName = nameLineCandidates.join(' ') || lines[typeSlotLineIndex - 1].trim()
  } else if (lines.length > 0) {
    // Fallback: first line
    result.itemName = lines[0].trim()
  }

  // ---- Item Power: search near the type+slot line ----
  const ipSearchStart = Math.max(0, typeSlotLineIndex - 1)
  const ipSearchEnd = Math.min(lines.length, typeSlotLineIndex + 5)
  for (let i = ipSearchStart; i < ipSearchEnd; i++) {
    const ipMatch = lines[i].match(ITEM_POWER_REGEX)
    if (ipMatch) {
      result.itemPower = parseInt(ipMatch[1], 10)
      break
    }
  }

  // ---- Body parsing (lines after the tooltip header) ----
  const bodyStart = typeSlotLineIndex >= 0 ? typeSlotLineIndex + 1 : 1
  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Skip the item power line (already processed)
    if (ITEM_POWER_REGEX.test(line)) continue

    // Skip lines that just repeat the type keyword
    if (ITEM_TYPES.some((t) => line.includes(t.keyword))) continue

    // Check for greater affix markers
    let isGreater = false
    let cleanLine = line
    for (const marker of GREATER_AFFIX_MARKERS) {
      if (line.startsWith(marker)) {
        isGreater = true
        cleanLine = line.slice(marker.length).trim()
        break
      }
    }

    // Socket detection
    const socketMatch = line.match(SOCKET_REGEX)
    if (socketMatch) {
      const count = socketMatch[1] || socketMatch[2]
      result.sockets = count ? parseInt(count, 10) : 1

      // Check for socket contents like "Empty Socket" or gem names
      if (line.toLowerCase().includes('empty')) {
        result.socketContents.push('Empty')
      }
      continue
    }

    // Affix detection
    if (ADDITIVE_AFFIX_REGEX.test(cleanLine) || MULTIPLICATIVE_AFFIX_REGEX.test(cleanLine)) {
      result.affixes.push(cleanLine)

      if (isGreater) {
        // Extract the affix name without the numeric prefix for greater affix tracking
        const nameMatch = cleanLine.match(/^[+×x]\s*[\d.]+%?\s+(.+)/i)
        if (nameMatch) {
          result.greaterAffixes.push(nameMatch[1].trim())
        }
      }
    }
  }

  return result
}
