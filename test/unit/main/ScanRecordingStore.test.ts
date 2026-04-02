import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ScanRecordingStore } from '../../../src/main/services/ScanRecordingStore'
import type { ScanRecording } from '../../../src/shared/types'
import { mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'

const TEST_DIR = join(__dirname, '__test_recordings__')

describe('ScanRecordingStore', () => {
  let store: ScanRecordingStore

  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
    mkdirSync(TEST_DIR, { recursive: true })
    store = new ScanRecordingStore(TEST_DIR)
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  })

  it('should save and list recordings', () => {
    const recording: Omit<ScanRecording, 'id' | 'timestamp'> = {
      screenshotPath: '/fake/screenshot.png',
      ocrLines: ['line 1', 'line 2'],
      parsedItem: {
        slot: 'Helm',
        itemName: 'Test',
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

    store.save(recording, '/fake/screenshot.png')
    const all = store.list()
    expect(all.length).toBe(1)
    expect(all[0].ocrLines).toEqual(['line 1', 'line 2'])
  })

  it('should return empty array when no recordings exist', () => {
    expect(store.list()).toEqual([])
  })
})
