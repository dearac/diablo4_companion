/**
 * SidecarManager — Manages the Python OCR sidecar process.
 *
 * Spawns a long-lived Python process that communicates via
 * newline-delimited JSON over stdin/stdout. Each request gets
 * a unique ID so responses can be matched to their callers.
 *
 * Lifecycle:
 *   - Lazy start: first call to `send()` spawns the process
 *   - Keeps running for subsequent scans (no startup penalty)
 *   - Killed on app quit via `shutdown()`
 *   - Registered with ProcessManager for orphan cleanup
 *
 * Path resolution:
 *   1. Bundled: `resources/sidecar/python/python.exe`
 *   2. System: `python` or `python3` on PATH
 */

import { spawn, type ChildProcess } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'

// ============================================================
// Types
// ============================================================

/** A request sent to the Python sidecar */
interface SidecarRequest {
  id: string
  cmd: string
  [key: string]: unknown
}

/** A response received from the Python sidecar */
interface SidecarResponse {
  id: string
  ok: boolean
  result?: Record<string, unknown>
  error?: string
  traceback?: string
}

/** Pending request with its resolve/reject callbacks */
interface PendingRequest {
  resolve: (response: SidecarResponse) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

// ============================================================
// SidecarManager
// ============================================================

export class SidecarManager {
  private static instance: SidecarManager | null = null

  /** The spawned Python child process */
  private process: ChildProcess | null = null

  /** Whether the sidecar has sent its "ready" message */
  private ready = false

  /** Pending requests awaiting responses, keyed by request ID */
  private pending = new Map<string, PendingRequest>()

  /** Buffer for incomplete JSON lines from stdout */
  private stdoutBuffer = ''

  /** Incrementing counter for unique request IDs */
  private requestCounter = 0

  /** Base directory for resolving sidecar paths */
  private appDir: string

  /** Timeout for individual requests (ms) */
  private readonly REQUEST_TIMEOUT = 30_000

  /** Timeout for sidecar startup (ms) */
  private readonly STARTUP_TIMEOUT = 15_000

  private constructor(appDir: string) {
    this.appDir = appDir
  }

  /** Override the Python executable path (set by PythonBootstrapper) */
  private explicitPythonPath: string | null = null

  /**
   * Sets the Python executable path to use.
   * Call this after PythonBootstrapper ensures the environment is ready.
   */
  setPythonPath(pythonPath: string): void {
    this.explicitPythonPath = pythonPath
  }

  /** Override the Tesseract tessdata directory (set by PythonBootstrapper) */
  private explicitTessdataDir: string | null = null

  /**
   * Sets the Tesseract tessdata directory path.
   * This is used as the TESSDATA_PREFIX env var when spawning the sidecar.
   */
  setTesseractDir(tessdataDir: string): void {
    this.explicitTessdataDir = tessdataDir
  }

  /**
   * Gets or creates the singleton SidecarManager instance.
   */
  static getInstance(appDir?: string): SidecarManager {
    if (!SidecarManager.instance) {
      if (!appDir) throw new Error('SidecarManager requires appDir on first call')
      SidecarManager.instance = new SidecarManager(appDir)
    }
    return SidecarManager.instance
  }

  /**
   * Sends a command to the Python sidecar and waits for the response.
   * Automatically starts the sidecar if it isn't running.
   *
   * @param cmd - The command name (e.g. "ocr", "ping")
   * @param payload - Additional fields to include in the request
   * @returns The sidecar's response object
   */
  async send(cmd: string, payload: Record<string, unknown> = {}): Promise<SidecarResponse> {
    // Ensure the sidecar is running
    if (!this.process || this.process.killed) {
      await this.start()
    }

    const id = `req_${++this.requestCounter}_${Date.now()}`
    const request: SidecarRequest = { id, cmd, ...payload }

    return new Promise<SidecarResponse>((resolve, reject) => {
      // Set a timeout for this request
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Sidecar request timed out after ${this.REQUEST_TIMEOUT}ms: ${cmd}`))
      }, this.REQUEST_TIMEOUT)

      this.pending.set(id, { resolve, reject, timer })

      // Write the request as a JSON line to stdin
      const line = JSON.stringify(request) + '\n'
      this.process?.stdin?.write(line)
    })
  }

  /**
   * Starts the Python sidecar process.
   * Resolves when the sidecar sends its "ready" message.
   */
  private async start(): Promise<void> {
    if (this.process && !this.process.killed) {
      return // Already running
    }

    const pythonPath = this.resolvePythonPath()
    const scriptPath = this.resolveScriptPath()

    console.log(`[SidecarManager] Starting Python sidecar:`)
    console.log(`  Python: ${pythonPath}`)
    console.log(`  Script: ${scriptPath}`)

    // Set Tesseract paths for the bundled/portable Tesseract
    const tessdataDir = this.resolveTessdataDir()
    const env = { ...process.env }
    if (tessdataDir) {
      env.TESSDATA_PREFIX = tessdataDir
      // Add the Tesseract binary directory to PATH so pytesseract can find it
      const tesseractBinDir = join(tessdataDir, '..')
      env.PATH = `${tesseractBinDir};${env.PATH || ''}`
      // Also set explicit path for scan.py to configure pytesseract
      env.TESSERACT_CMD = join(tesseractBinDir, 'tesseract.exe')
    }

    this.process = spawn(pythonPath, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
      windowsHide: true
    })
    // Note: sidecar cleanup is handled by SidecarManager.shutdown(),
    // not ProcessManager (which is for Playwright browsers only).

    // Handle stdout data (newline-delimited JSON)
    this.process.stdout?.setEncoding('utf-8')
    this.process.stdout?.on('data', (data: string) => {
      this.handleStdout(data)
    })

    // Log stderr for debugging
    this.process.stderr?.setEncoding('utf-8')
    this.process.stderr?.on('data', (data: string) => {
      console.error(`[SidecarManager] stderr: ${data.trim()}`)
    })

    // Handle process exit
    this.process.on('exit', (code, signal) => {
      console.log(`[SidecarManager] Process exited: code=${code}, signal=${signal}`)
      this.process = null
      this.ready = false

      // Reject all pending requests
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer)
        pending.reject(new Error(`Sidecar process exited unexpectedly (code ${code})`))
        this.pending.delete(id)
      }
    })

    this.process.on('error', (err) => {
      console.error(`[SidecarManager] Process error:`, err)
      this.process = null
      this.ready = false
    })

    // Wait for the "ready" message
    await this.waitForReady()
  }

  /**
   * Waits for the sidecar to send its startup "ready" message.
   */
  private waitForReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ready) {
        resolve()
        return
      }

      const timer = setTimeout(() => {
        reject(new Error(`Sidecar failed to start within ${this.STARTUP_TIMEOUT}ms`))
      }, this.STARTUP_TIMEOUT)

      // The "ready" message is handled in handleStdout
      const check = (): void => {
        if (this.ready) {
          clearTimeout(timer)
          resolve()
        } else if (!this.process || this.process.killed) {
          clearTimeout(timer)
          reject(new Error('Sidecar process died during startup'))
        } else {
          setTimeout(check, 50)
        }
      }
      check()
    })
  }

  /**
   * Handles data from the sidecar's stdout.
   * Buffers partial lines and parses complete JSON objects.
   */
  private handleStdout(data: string): void {
    this.stdoutBuffer += data

    // Process complete lines
    const lines = this.stdoutBuffer.split('\n')
    // Keep the last (potentially incomplete) chunk in the buffer
    this.stdoutBuffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      try {
        const msg = JSON.parse(trimmed)

        // Handle startup "ready" message
        if (msg.type === 'ready') {
          this.ready = true
          console.log(`[SidecarManager] Sidecar ready (v${msg.version})`)
          continue
        }

        // Handle response to a pending request
        const id = msg.id as string
        const pending = this.pending.get(id)
        if (pending) {
          clearTimeout(pending.timer)
          this.pending.delete(id)
          pending.resolve(msg as SidecarResponse)
        } else {
          console.warn(`[SidecarManager] Received response for unknown ID: ${id}`)
        }
      } catch {
        console.error(`[SidecarManager] Failed to parse stdout line: ${trimmed}`)
      }
    }
  }

  /**
   * Resolves the path to the Python executable.
   * Checks bundled location first, then falls back to system Python.
   */
  private resolvePythonPath(): string {
    // 0. Explicit path from PythonBootstrapper
    if (this.explicitPythonPath && existsSync(this.explicitPythonPath)) {
      return this.explicitPythonPath
    }

    // 1. Bundled Python (portable build — in resources)
    const bundled = join(this.appDir, 'resources', 'sidecar', 'python', 'python.exe')
    if (existsSync(bundled)) {
      return bundled
    }

    // 2. Sidecar directory next to app (dev mode)
    const devBundled = join(this.appDir, 'sidecar', 'python', 'python.exe')
    if (existsSync(devBundled)) {
      return devBundled
    }

    // 3. PythonBootstrapper's data directory
    const dataPython = join(this.appDir, 'data', 'python', 'python.exe')
    if (existsSync(dataPython)) {
      return dataPython
    }

    // 4. System Python fallback
    return process.platform === 'win32' ? 'python' : 'python3'
  }

  /**
   * Resolves the path to the scan.py script.
   */
  private resolveScriptPath(): string {
    // 1. Bundled (production)
    const bundled = join(this.appDir, 'resources', 'sidecar', 'scan.py')
    if (existsSync(bundled)) {
      return bundled
    }

    // 2. Dev mode
    const dev = join(this.appDir, 'sidecar', 'scan.py')
    if (existsSync(dev)) {
      return dev
    }

    throw new Error('Could not find sidecar/scan.py')
  }

  /**
   * Resolves the Tesseract tessdata directory.
   */
  private resolveTessdataDir(): string | null {
    // 0. Explicit path from PythonBootstrapper
    if (this.explicitTessdataDir && existsSync(this.explicitTessdataDir)) {
      return this.explicitTessdataDir
    }

    // 1. Bundled (in resources)
    const bundled = join(this.appDir, 'resources', 'sidecar', 'tesseract', 'tessdata')
    if (existsSync(bundled)) {
      return bundled
    }

    // 2. Dev mode sidecar
    const dev = join(this.appDir, 'sidecar', 'tesseract', 'tessdata')
    if (existsSync(dev)) {
      return dev
    }

    // 3. PythonBootstrapper's data directory
    const dataTess = join(this.appDir, 'data', 'tesseract', 'tessdata')
    if (existsSync(dataTess)) {
      return dataTess
    }

    // 4. Let Tesseract use its default (system install)
    return null
  }

  /**
   * Kills the sidecar process immediately.
   */
  kill(): void {
    if (this.process && !this.process.killed) {
      console.log('[SidecarManager] Killing sidecar process')
      this.process.kill('SIGTERM')
      this.process = null
      this.ready = false
    }
  }

  /**
   * Gracefully shuts down the sidecar process.
   * Called during app quit.
   */
  async shutdown(): Promise<void> {
    this.kill()

    // Clear all pending requests
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Sidecar shutting down'))
      this.pending.delete(id)
    }
  }

  /**
   * Returns whether the sidecar is currently running and ready.
   */
  isReady(): boolean {
    return this.ready && this.process !== null && !this.process.killed
  }
}
