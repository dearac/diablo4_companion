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

  // ---- Header parsing (first 5 lines) ----
  const headerLines = lines.slice(0, Math.min(5, lines.length))

  // Find item type + slot from header
  for (const line of headerLines) {
    const upper = line.toUpperCase()
    for (const typeInfo of ITEM_TYPES) {
      if (upper.includes(typeInfo.keyword.toUpperCase())) {
        result.itemType = typeInfo.type
        // Now find the slot in this same line
        for (const slot of GEAR_SLOTS) {
          if (upper.includes(slot.toUpperCase())) {
            result.slot = slot
            break
          }
        }
        break
      }
    }
    if (result.slot !== 'Unknown') break
  }

  // Item name is typically the first line
  if (lines.length > 0) {
    result.itemName = lines[0].trim()
  }

  // ---- Item Power ----
  for (const line of headerLines) {
    const ipMatch = line.match(ITEM_POWER_REGEX)
    if (ipMatch) {
      result.itemPower = parseInt(ipMatch[1], 10)
      break
    }
  }

  // ---- Body parsing (remaining lines) ----
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Skip header lines we already processed
    if (i < 3 && (ITEM_POWER_REGEX.test(line) || ITEM_TYPES.some((t) => line.includes(t.keyword))))
      continue

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
