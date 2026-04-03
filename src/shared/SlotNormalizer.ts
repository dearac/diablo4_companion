/**
 * SlotNormalizer — Maps OCR-parsed slot names to canonical build slot names.
 *
 * The scraper (d4builds.gg) uses: Helm, Chest Armor, Gloves, Pants, Boots,
 *   Weapon, Amulet, Ring 1, Ring 2, Offhand
 *
 * The OCR (GearParser) uses raw game slot names: Helm, Chest Armor, Gloves,
 *   Pants, Boots, Sword, Mace, Axe, Dagger, Polearm, Scythe, Wand, Bow,
 *   Crossbow, Staff, Two-Handed *, Shield, Focus, Totem, Amulet, Ring
 *
 * This module normalizes OCR slots → canonical build slots so both systems
 * can reference the same keys.
 */

/** Weapon-type slot names that map to the canonical "Weapon" slot */
const WEAPON_SLOTS = new Set([
  'Sword',
  'Mace',
  'Axe',
  'Dagger',
  'Scythe',
  'Wand',
  'Bow',
  'Crossbow',
  'Polearm',
  'Staff',
  'Two-Handed Sword',
  'Two-Handed Mace',
  'Two-Handed Axe',
  'Two-Handed Scythe',
  'Two-Handed Staff'
])

/** Off-hand slot names that map to the canonical "Offhand" slot */
const OFFHAND_SLOTS = new Set(['Shield', 'Focus', 'Totem'])

/**
 * Normalizes an OCR-parsed slot name to the canonical build-data slot name.
 *
 * @param ocrSlot - The raw slot name from GearParser
 * @returns The canonical slot name used in build data
 */
export function normalizeSlot(ocrSlot: string): string {
  if (ocrSlot === 'Chest') return 'Chest Armor'
  if (WEAPON_SLOTS.has(ocrSlot)) return 'Weapon'
  if (OFFHAND_SLOTS.has(ocrSlot)) return 'Offhand'
  // "Ring" stays as "Ring" — disambiguation happens at store level
  return ocrSlot
}

/**
 * All canonical slot names in display order.
 * This is the single source of truth for both the overlay and main app.
 */
export const CANONICAL_SLOTS = [
  'Helm',
  'Chest Armor',
  'Gloves',
  'Pants',
  'Boots',
  'Amulet',
  'Ring 1',
  'Ring 2',
  'Weapon',
  'Offhand'
]
