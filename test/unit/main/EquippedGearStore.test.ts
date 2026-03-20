import { describe, it, expect, beforeEach } from 'vitest'
import { EquippedGearStore } from '../../../src/main/services/EquippedGearStore'
import type { ScannedGearPiece } from '../../../src/shared/types'

/** Helper to create a minimal ScannedGearPiece for testing */
const makeGear = (slot: string, name: string): ScannedGearPiece => ({
  slot,
  itemName: name,
  itemType: 'Legendary',
  itemPower: 925,
  affixes: ['+10% Crit'],
  implicitAffixes: [],
  temperedAffixes: [],
  greaterAffixes: [],
  sockets: 1,
  socketContents: [],
  aspect: null,
  rawText: ''
})

describe('EquippedGearStore', () => {
  let store: EquippedGearStore

  beforeEach(() => {
    // Use in-memory mode (null file path)
    store = new EquippedGearStore(null)
  })

  it('should equip a piece of gear', () => {
    const helm = makeGear('Helm', 'Test Helm')
    store.equip(helm)

    // Canonical slot name preserved, item slot updated to canonical
    const equipped = store.getEquipped('Helm')
    expect(equipped).not.toBeNull()
    expect(equipped!.itemName).toBe('Test Helm')
    expect(equipped!.slot).toBe('Helm')
  })

  it('should replace existing equipped gear in same slot', () => {
    store.equip(makeGear('Helm', 'Old Helm'))
    store.equip(makeGear('Helm', 'New Helm'))

    expect(store.getEquipped('Helm')?.itemName).toBe('New Helm')
  })

  it('should return null for empty slots', () => {
    expect(store.getEquipped('Helm')).toBeNull()
  })

  it('should return all equipped gear', () => {
    store.equip(makeGear('Helm', 'My Helm'))
    store.equip(makeGear('Gloves', 'My Gloves'))

    const all = store.getAllEquipped()
    expect(Object.keys(all)).toHaveLength(2)
    expect(all['Helm'].itemName).toBe('My Helm')
    expect(all['Gloves'].itemName).toBe('My Gloves')
  })

  it('should clear all equipped gear', () => {
    store.equip(makeGear('Helm', 'My Helm'))
    store.equip(makeGear('Gloves', 'My Gloves'))
    store.clearAll()

    expect(store.getEquipped('Helm')).toBeNull()
    expect(store.getEquipped('Gloves')).toBeNull()
    expect(Object.keys(store.getAllEquipped())).toHaveLength(0)
  })

  it('should not affect other slots when equipping', () => {
    store.equip(makeGear('Helm', 'My Helm'))
    store.equip(makeGear('Gloves', 'My Gloves'))

    expect(store.getEquipped('Helm')?.itemName).toBe('My Helm')
    expect(store.getEquipped('Gloves')?.itemName).toBe('My Gloves')
  })

  // ── Slot Normalization Tests ──

  it('should normalize "Sword" to "Weapon"', () => {
    store.equip(makeGear('Sword', 'Griswold Opus'))

    expect(store.getEquipped('Weapon')?.itemName).toBe('Griswold Opus')
    expect(store.getEquipped('Weapon')?.slot).toBe('Weapon')
    expect(store.getEquipped('Sword')).toBeNull() // Raw slot not used as key
  })

  it('should normalize "Shield" to "Offhand"', () => {
    store.equip(makeGear('Shield', 'Ward of the Dove'))

    expect(store.getEquipped('Offhand')?.itemName).toBe('Ward of the Dove')
    expect(store.getEquipped('Offhand')?.slot).toBe('Offhand')
    expect(store.getEquipped('Shield')).toBeNull()
  })

  it('should normalize "Focus" to "Offhand"', () => {
    store.equip(makeGear('Focus', 'Arcane Focus'))

    expect(store.getEquipped('Offhand')?.itemName).toBe('Arcane Focus')
  })

  it('should disambiguate first Ring to "Ring 1"', () => {
    store.equip(makeGear('Ring', 'First Ring'))

    expect(store.getEquipped('Ring 1')?.itemName).toBe('First Ring')
    expect(store.getEquipped('Ring 1')?.slot).toBe('Ring 1')
    expect(store.getEquipped('Ring')).toBeNull()
  })

  it('should disambiguate second Ring to "Ring 2"', () => {
    store.equip(makeGear('Ring', 'First Ring'))
    store.equip(makeGear('Ring', 'Second Ring'))

    expect(store.getEquipped('Ring 1')?.itemName).toBe('First Ring')
    expect(store.getEquipped('Ring 2')?.itemName).toBe('Second Ring')
    expect(store.getEquipped('Ring 2')?.slot).toBe('Ring 2')
  })

  it('should normalize Two-Handed weapon types to "Weapon"', () => {
    store.equip(makeGear('Two-Handed Sword', 'Big Blade'))

    expect(store.getEquipped('Weapon')?.itemName).toBe('Big Blade')
    expect(store.getEquipped('Two-Handed Sword')).toBeNull()
  })

  it('should keep canonical slot names unchanged', () => {
    // These should NOT be normalized further
    store.equip(makeGear('Pants', 'Nice Pants'))
    store.equip(makeGear('Boots', 'Fast Boots'))
    store.equip(makeGear('Amulet', 'Shiny Amulet'))

    expect(store.getEquipped('Pants')?.itemName).toBe('Nice Pants')
    expect(store.getEquipped('Boots')?.itemName).toBe('Fast Boots')
    expect(store.getEquipped('Amulet')?.itemName).toBe('Shiny Amulet')
  })
})
