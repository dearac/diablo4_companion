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

    expect(store.getEquipped('Helm')).toEqual(helm)
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
})
