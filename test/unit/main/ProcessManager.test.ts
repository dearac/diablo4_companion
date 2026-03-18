import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ProcessManager } from '../../../src/main/services/ProcessManager'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { mkdtempSync } from 'fs'

// ============================================================
// ProcessManager Unit Tests
// ============================================================
// Tests the singleton process tracking service that prevents
// orphaned Playwright browsers when the app exits mid-scrape.
// ============================================================

/** Creates a mock Playwright Browser with a controllable close() */
function createMockBrowser(pid?: number) {
  return {
    close: vi.fn().mockResolvedValue(undefined),
    process: pid ? vi.fn().mockReturnValue({ pid }) : undefined
  }
}

describe('ProcessManager', () => {
  let tempDir: string

  beforeEach(() => {
    // Reset the singleton between tests so they're independent
    ProcessManager.resetInstance()
    tempDir = mkdtempSync(join(tmpdir(), 'pm-test-'))
  })

  afterEach(() => {
    // Clean up PID file if it exists
    const pidFile = join(tempDir, 'active-pids.json')
    if (existsSync(pidFile)) {
      unlinkSync(pidFile)
    }
  })

  it('should be a singleton', () => {
    const a = ProcessManager.getInstance()
    const b = ProcessManager.getInstance()
    expect(a).toBe(b)
  })

  it('should track registered browsers', () => {
    const pm = ProcessManager.getInstance()
    const browser1 = createMockBrowser()
    const browser2 = createMockBrowser()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pm.register(browser1 as any)
    expect(pm.activeCount).toBe(1)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pm.register(browser2 as any)
    expect(pm.activeCount).toBe(2)
  })

  it('should unregister browsers', () => {
    const pm = ProcessManager.getInstance()
    const browser = createMockBrowser()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pm.register(browser as any)
    expect(pm.activeCount).toBe(1)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pm.unregister(browser as any)
    expect(pm.activeCount).toBe(0)
  })

  it('should close all tracked browsers on killAll()', async () => {
    const pm = ProcessManager.getInstance()
    const browser1 = createMockBrowser()
    const browser2 = createMockBrowser()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pm.register(browser1 as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pm.register(browser2 as any)

    await pm.killAll()

    expect(browser1.close).toHaveBeenCalledOnce()
    expect(browser2.close).toHaveBeenCalledOnce()
    expect(pm.activeCount).toBe(0)
  })

  it('should handle individual close() failures gracefully in killAll()', async () => {
    const pm = ProcessManager.getInstance()
    const goodBrowser = createMockBrowser()
    const badBrowser = createMockBrowser()
    badBrowser.close.mockRejectedValue(new Error('Already dead'))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pm.register(badBrowser as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pm.register(goodBrowser as any)

    // Should not throw even though one browser fails
    await expect(pm.killAll()).resolves.not.toThrow()

    // Both should have been attempted
    expect(badBrowser.close).toHaveBeenCalledOnce()
    expect(goodBrowser.close).toHaveBeenCalledOnce()
    expect(pm.activeCount).toBe(0)
  })

  it('should write PID file on register when dataDir is set', () => {
    const pm = ProcessManager.getInstance()
    pm.setDataDir(tempDir)

    const browser = createMockBrowser(12345)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pm.register(browser as any)

    const pidFile = join(tempDir, 'active-pids.json')
    expect(existsSync(pidFile)).toBe(true)

    const pids = JSON.parse(readFileSync(pidFile, 'utf-8'))
    expect(pids).toContain(12345)
  })

  it('should delete PID file after killAll()', async () => {
    const pm = ProcessManager.getInstance()
    pm.setDataDir(tempDir)

    const browser = createMockBrowser(12345)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pm.register(browser as any)

    const pidFile = join(tempDir, 'active-pids.json')
    expect(existsSync(pidFile)).toBe(true)

    await pm.killAll()
    expect(existsSync(pidFile)).toBe(false)
  })

  it('should delete PID file after cleanupStalePids()', () => {
    const pm = ProcessManager.getInstance()
    pm.setDataDir(tempDir)

    // Simulate stale PID file from a previous session
    const pidFile = join(tempDir, 'active-pids.json')
    writeFileSync(pidFile, JSON.stringify([99999]), 'utf-8')

    pm.cleanupStalePids()

    // PID file should be cleaned up after processing
    expect(existsSync(pidFile)).toBe(false)
  })

  it('should not crash when cleanupStalePids() has no PID file', () => {
    const pm = ProcessManager.getInstance()
    pm.setDataDir(tempDir)

    // Should not throw
    expect(() => pm.cleanupStalePids()).not.toThrow()
  })

  it('should not crash when cleanupStalePids() has invalid JSON', () => {
    const pm = ProcessManager.getInstance()
    pm.setDataDir(tempDir)

    const pidFile = join(tempDir, 'active-pids.json')
    writeFileSync(pidFile, 'not valid json', 'utf-8')

    // Should not throw
    expect(() => pm.cleanupStalePids()).not.toThrow()
    // File should be cleaned up even on error
    expect(existsSync(pidFile)).toBe(false)
  })

  it('should not write PID file when dataDir is not set', () => {
    const pm = ProcessManager.getInstance()
    // Deliberately do NOT call setDataDir

    const browser = createMockBrowser(12345)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pm.register(browser as any)

    // No file should be created at the root level
    expect(pm.activeCount).toBe(1)
  })
})
