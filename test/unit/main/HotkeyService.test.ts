import { describe, it, expect } from 'vitest'
import { HotkeyService } from '../../../src/main/services/HotkeyService'

describe('HotkeyService', () => {
  it('should return default hotkeys when no store is provided', () => {
    // Arrange: create service with null store (like in tests)
    const service = new HotkeyService(null)

    // Assert: should return the factory defaults
    expect(service.getHotkey('scan')).toBe('F7')
    expect(service.getHotkey('report')).toBe('F8')
    expect(service.getHotkey('toggle')).toBe('F6')
  })

  it('should allow changing a hotkey', () => {
    const service = new HotkeyService(null)

    // Act: change the scan key from F7 to F9
    service.setHotkey('scan', 'F9')

    // Assert: scan should now be F9, others unchanged
    expect(service.getHotkey('scan')).toBe('F9')
    expect(service.getHotkey('report')).toBe('F8')
  })

  it('should return all hotkeys in a single object', () => {
    const service = new HotkeyService(null)
    const all = service.getAllHotkeys()

    expect(all).toEqual({
      scan: 'F7',
      report: 'F8',
      toggle: 'F6',
      detach: 'F9'
    })
  })

  it('should persist overrides to the store', () => {
    // Arrange: create a mock store that records what gets saved
    const saved: Record<string, unknown> = {}
    const mockStore = {
      get: (_key: string, defaultVal: unknown) => defaultVal,
      set: (key: string, val: unknown) => {
        saved[key] = val
      }
    }

    const service = new HotkeyService(mockStore)

    // Act: change a hotkey
    service.setHotkey('toggle', 'F12')

    // Assert: the store should have been called with the new value
    expect(saved['hotkeys']).toEqual({ toggle: 'F12' })
  })

  it('should reset all overrides to factory defaults', () => {
    const saved: Record<string, unknown> = {}
    const mockStore = {
      get: (_key: string, defaultVal: unknown) => defaultVal,
      set: (key: string, val: unknown) => {
        saved[key] = val
      }
    }

    const service = new HotkeyService(mockStore)

    // Customize some keys
    service.setHotkey('scan', 'F10')
    service.setHotkey('toggle', 'F12')

    // Reset
    service.resetAll()

    // All should be back to defaults
    expect(service.getAllHotkeys()).toEqual({
      scan: 'F7',
      report: 'F8',
      toggle: 'F6',
      detach: 'F9'
    })
    // Store should have been set to empty overrides
    expect(saved['hotkeys']).toEqual({})
  })

  it('should expose factory defaults via static method', () => {
    expect(HotkeyService.getDefaults()).toEqual({
      scan: 'F7',
      report: 'F8',
      toggle: 'F6',
      detach: 'F9'
    })
  })
})
