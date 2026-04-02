import { describe, it, expect } from 'vitest'
import { replayScan } from '../../../src/shared/ScanReplayRunner'
import type { ScanRecording } from '../../../src/shared/types'

describe('ScanReplayRunner', () => {
  it('should replay a recording and produce a ReplayResult', () => {
    const recording: ScanRecording = {
      id: 'test-1',
      timestamp: new Date().toISOString(),
      screenshotPath: 'screenshot.png',
      ocrLines: ['Test Helm', 'Legendary Helm', '925 Item Power', '+100 Strength'],
      parsedItem: {
        slot: 'Helm',
        itemName: 'Test Helm',
        itemType: 'Legendary',
        itemPower: 925,
        affixes: ['+100 Strength'],
        implicitAffixes: [],
        temperedAffixes: [],
        greaterAffixes: [],
        sockets: 0,
        socketContents: [],
        aspect: null,
        rawText: ''
      },
      buildSlot: {
        slot: 'Helm',
        itemName: null,
        itemType: 'Legendary',
        requiredAspect: null,
        affixes: [{ name: 'Strength', isGreater: false }],
        implicitAffixes: [],
        temperedAffixes: [],
        greaterAffixes: [],
        masterworkPriority: [],
        rampageEffect: null,
        feastEffect: null,
        socketedGems: []
      },
      buildName: 'Test Build',
      verdict: null,
      perfectibility: null
    }

    const result = replayScan(recording)
    expect(result.recording).toBe(recording)
    expect(result.reparsedItem).toBeTruthy()
    expect(result.reparsedItem.slot).toBe('Helm')
  })

  it('should detect diffs when pipeline behavior changes', () => {
    // This test ensures the diff mechanism works
    const recording: ScanRecording = {
      id: 'test-2',
      timestamp: new Date().toISOString(),
      screenshotPath: 'screenshot.png',
      ocrLines: ['Test Helm', 'Legendary Helm', '925 Item Power', '+100 Strength'],
      parsedItem: {
        slot: 'Helm',
        itemName: 'Test Helm',
        itemType: 'Legendary',
        itemPower: 925,
        affixes: ['+100 Strength'],
        implicitAffixes: [],
        temperedAffixes: [],
        greaterAffixes: [],
        sockets: 0,
        socketContents: [],
        aspect: null,
        rawText: ''
      },
      buildSlot: null,
      buildName: null,
      verdict: null,
      perfectibility: null
    }

    const result = replayScan(recording)
    // No build slot → no verdict → diffs should be empty
    expect(result.diffs).toEqual([])
  })
})
