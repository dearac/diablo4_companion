import { describe, it, expect, beforeEach } from 'vitest'
import { ScanHistoryStore } from '../../../src/main/services/ScanHistoryStore'
import type { ScanVerdict, ScannedGearPiece } from '../../../src/shared/types'

/** Minimal ScannedGearPiece builder */
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

/** Minimal ScanVerdict builder */
const makeVerdict = (
  slot: string,
  name: string,
  verdict: ScanVerdict['verdict'] = 'UPGRADE'
): ScanVerdict => ({
  scannedItem: makeGear(slot, name),
  buildMatchCount: 3,
  buildTotalExpected: 4,
  buildMatchPercent: 75,
  matchedAffixes: ['Crit Strike', 'Max Life', 'Armor'],
  missingAffixes: ['Dexterity'],
  extraAffixes: [],
  socketDelta: 0,
  greaterAffixCount: 0,
  verdict,
  equippedComparison: null,
  recommendations: []
})

describe('ScanHistoryStore', () => {
  let store: ScanHistoryStore

  beforeEach(() => {
    store = new ScanHistoryStore(null) // in-memory mode
  })

  it('should add a verdict and retrieve it', () => {
    const v = makeVerdict('Helm', 'Test Helm')
    store.addVerdict(v)
    const all = store.getAll()
    expect(all).toHaveLength(1)
    expect(all[0].verdict).toEqual(v)
    expect(all[0].scannedAt).toBeDefined()
  })

  it('should return newest first', () => {
    store.addVerdict(makeVerdict('Helm', 'First'))
    store.addVerdict(makeVerdict('Gloves', 'Second'))
    const all = store.getAll()
    expect(all[0].verdict.scannedItem.itemName).toBe('Second')
    expect(all[1].verdict.scannedItem.itemName).toBe('First')
  })

  it('should clear all entries', () => {
    store.addVerdict(makeVerdict('Helm', 'Test'))
    store.clearAll()
    expect(store.getAll()).toHaveLength(0)
  })

  it('should auto-prune entries older than 15 minutes', () => {
    store.addVerdict(makeVerdict('Helm', 'Old'))
    // Manually backdate the internal entry to 16 min ago
    const entries = store.getRawEntries()
    entries[0].scannedAt = Date.now() - 16 * 60 * 1000
    // getAll prunes on read
    const fresh = store.getAll()
    expect(fresh).toHaveLength(0)
  })

  it('should return count of entries', () => {
    store.addVerdict(makeVerdict('Helm', 'H'))
    store.addVerdict(makeVerdict('Gloves', 'G'))
    expect(store.count()).toBe(2)
  })

  it('should not affect other entries when adding', () => {
    store.addVerdict(makeVerdict('Helm', 'H'))
    store.addVerdict(makeVerdict('Gloves', 'G'))
    const all = store.getAll()
    expect(all).toHaveLength(2)
    expect(all[0].verdict.scannedItem.slot).toBe('Gloves')
    expect(all[1].verdict.scannedItem.slot).toBe('Helm')
  })
})
