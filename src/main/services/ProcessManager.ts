import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import type { Browser } from 'playwright'

// ============================================================
// ProcessManager — Tracks and cleans up Playwright browsers
// ============================================================
// Prevents orphaned Chromium processes when the app exits
// mid-scrape. Also cleans up stale processes from previous
// crashed sessions on relaunch.
//
// Usage:
//   const pm = ProcessManager.getInstance()
//   pm.setDataDir(dataPaths.userData)     // once at startup
//   pm.register(browser)                 // after chromium.launch()
//   pm.unregister(browser)               // after browser.close()
//   await pm.killAll()                   // on app quit
//   pm.cleanupStalePids()               // on app launch
// ============================================================

/** Filename for the PID tracking file */
const PID_FILE = 'active-pids.json'

/**
 * Singleton service that tracks active Playwright Browser instances
 * and their OS-level PIDs. Ensures all child processes are cleaned
 * up when the Electron app exits.
 */
export class ProcessManager {
  private static instance: ProcessManager | null = null

  /** All currently active Playwright browser instances */
  private activeBrowsers: Set<Browser> = new Set()

  /** Directory where the PID file is stored */
  private dataDir: string = ''

  private constructor() {
    // Singleton — use getInstance()
  }

  /** Returns the singleton ProcessManager instance. */
  static getInstance(): ProcessManager {
    if (!ProcessManager.instance) {
      ProcessManager.instance = new ProcessManager()
    }
    return ProcessManager.instance
  }

  /**
   * Resets the singleton (for testing only).
   * @internal
   */
  static resetInstance(): void {
    ProcessManager.instance = null
  }

  /**
   * Sets the data directory where PID files are written.
   * Must be called before register() or cleanupStalePids().
   */
  setDataDir(dir: string): void {
    this.dataDir = dir
  }

  /** Full path to the PID tracking file. */
  private get pidFilePath(): string {
    return join(this.dataDir, PID_FILE)
  }

  /**
   * Registers a Playwright browser for tracking.
   * Records its PID in both the in-memory set and the PID file.
   *
   * @param browser - The Playwright Browser instance from chromium.launch()
   */
  register(browser: Browser): void {
    this.activeBrowsers.add(browser)
    this.writePidFile()
  }

  /**
   * Unregisters a browser after it has been cleanly closed.
   * Removes it from tracking and updates the PID file.
   *
   * @param browser - The browser that was just closed
   */
  unregister(browser: Browser): void {
    this.activeBrowsers.delete(browser)
    this.writePidFile()
  }

  /**
   * Forcefully closes all tracked browsers.
   * Called during app shutdown to prevent orphaned processes.
   * Each browser is closed independently — one failure won't
   * block the others.
   */
  async killAll(): Promise<void> {
    const browsers = [...this.activeBrowsers]
    this.activeBrowsers.clear()

    const closePromises = browsers.map(async (browser) => {
      try {
        await browser.close()
      } catch (err) {
        // Browser may have already exited — that's fine
        console.warn('ProcessManager: failed to close browser:', err)
      }
    })

    await Promise.allSettled(closePromises)
    this.deletePidFile()
  }

  /**
   * Cleans up stale Chromium processes from a previous crashed session.
   * Reads PIDs from the PID file and kills them if they're still running.
   * Called once at app startup.
   */
  cleanupStalePids(): void {
    if (!this.dataDir || !existsSync(this.pidFilePath)) return

    try {
      const raw = readFileSync(this.pidFilePath, 'utf-8')
      const pids: number[] = JSON.parse(raw)

      for (const pid of pids) {
        this.tryKillPid(pid)
      }
    } catch (err) {
      console.warn('ProcessManager: error reading stale PID file:', err)
    }

    // Always clean up the file after processing
    this.deletePidFile()
  }

  /** Returns the count of currently tracked browsers. */
  get activeCount(): number {
    return this.activeBrowsers.size
  }

  // ---- Private helpers ----

  /**
   * Writes all active browser PIDs to disk.
   * This file is read on next startup to detect orphaned processes.
   */
  private writePidFile(): void {
    if (!this.dataDir) return

    try {
      const pids = this.collectPids()
      writeFileSync(this.pidFilePath, JSON.stringify(pids), 'utf-8')
    } catch (err) {
      console.warn('ProcessManager: failed to write PID file:', err)
    }
  }

  /** Removes the PID file from disk. */
  private deletePidFile(): void {
    try {
      if (existsSync(this.pidFilePath)) {
        unlinkSync(this.pidFilePath)
      }
    } catch {
      // Best-effort cleanup
    }
  }

  /**
   * Collects the OS-level PIDs from all tracked browsers.
   * Playwright's chromium.launch() returns a Browser backed by a ChildProcess.
   * The .process() method isn't in the public TypeScript types but exists at runtime.
   */
  private collectPids(): number[] {
    const pids: number[] = []
    for (const browser of this.activeBrowsers) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const proc = (browser as any).process?.()
        if (proc?.pid) {
          pids.push(proc.pid)
        }
      } catch {
        // Browser may not expose a process (e.g., remote connections)
      }
    }
    return pids
  }

  /**
   * Attempts to kill a single process by PID.
   * Uses taskkill on Windows, SIGKILL on other platforms.
   * Silently ignores errors (process may have already exited).
   */
  private tryKillPid(pid: number): void {
    try {
      if (process.platform === 'win32') {
        // /F = force, /T = kill child processes too
        execSync(`taskkill /PID ${pid} /F /T`, { stdio: 'ignore' })
      } else {
        process.kill(pid, 'SIGKILL')
      }
    } catch {
      // Process already gone — that's fine
    }
  }
}
