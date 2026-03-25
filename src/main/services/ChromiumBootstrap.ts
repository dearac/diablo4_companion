import { join } from 'path'
import { existsSync, mkdirSync, readdirSync } from 'fs'
import { execFile } from 'child_process'
import { is } from '@electron-toolkit/utils'

// ============================================================
// ChromiumBootstrap — Lazy Chromium download for Playwright
// ============================================================
// Instead of bundling a full Chromium browser (~360 MB) in the
// installer, we download it on first use. This drops the
// installer size from ~576 MB to ~120 MB and eliminates the
// ~15s extraction delay on every startup.
//
// Chromium is downloaded to <userData>/chromium/ using
// Playwright's built-in browser installer CLI. The download
// happens exactly once; subsequent runs find the cached binary.
// ============================================================

/** Progress callback for download status updates */
export type BootstrapProgress = {
  status: 'checking' | 'downloading' | 'ready' | 'error'
  message: string
}

/**
 * Manages on-demand Chromium installation for Playwright.
 *
 * Usage:
 *   const bootstrap = new ChromiumBootstrap(dataPaths.userData)
 *   const browserPath = await bootstrap.ensureBrowser(onProgress)
 */
export class ChromiumBootstrap {
  private chromiumDir: string
  private cachedPath: string | null = null

  constructor(userDataDir: string) {
    this.chromiumDir = join(userDataDir, 'chromium')
  }

  /**
   * Returns the path to the Chromium executable.
   * Downloads it on first call if not already present.
   *
   * In development, returns undefined so Playwright uses its
   * globally-installed browser from %LOCALAPPDATA%/ms-playwright/.
   *
   * @param onProgress - Optional callback for download progress updates
   * @returns Path to chrome.exe, or undefined in dev mode
   */
  async ensureBrowser(
    onProgress?: (progress: BootstrapProgress) => void
  ): Promise<string | undefined> {
    // In dev mode, let Playwright find its own browser
    if (is.dev) return undefined

    // Return cached path if we've already resolved it this session
    if (this.cachedPath && existsSync(this.cachedPath)) {
      return this.cachedPath
    }

    onProgress?.({ status: 'checking', message: 'Checking for browser...' })

    // Check if Chromium is already downloaded
    const chromePath = this.findChromePath()
    if (chromePath) {
      this.cachedPath = chromePath
      onProgress?.({ status: 'ready', message: 'Browser ready' })
      return chromePath
    }

    // Download Chromium using Playwright's CLI
    onProgress?.({
      status: 'downloading',
      message: 'Downloading browser for build imports (one-time, ~150 MB)...'
    })

    try {
      await this.downloadChromium()
      const downloadedPath = this.findChromePath()
      if (!downloadedPath) {
        throw new Error('Chromium download completed but executable not found')
      }
      this.cachedPath = downloadedPath
      onProgress?.({ status: 'ready', message: 'Browser ready' })
      return downloadedPath
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      onProgress?.({ status: 'error', message: `Browser download failed: ${message}` })
      throw new Error(`Failed to download Chromium: ${message}`)
    }
  }

  /**
   * Checks if Chromium is already downloaded.
   * @returns true if the chrome executable exists
   */
  get isDownloaded(): boolean {
    return this.findChromePath() !== null
  }

  /**
   * Searches for the Chromium executable in the download directory.
   * Playwright installs Chromium into a versioned subdirectory structure.
   *
   * @returns Path to chrome.exe if found, null otherwise
   */
  private findChromePath(): string | null {
    // Playwright downloads to: <PLAYWRIGHT_BROWSERS_PATH>/chromium-<revision>/chrome-win/chrome.exe
    // We also check the direct path in case it was placed there manually.
    const directPath = join(this.chromiumDir, 'chrome.exe')
    if (existsSync(directPath)) return directPath

    // Check Playwright's download structure
    if (!existsSync(this.chromiumDir)) return null

    try {
      const entries: string[] = readdirSync(this.chromiumDir) as string[]

      for (const entry of entries) {
        if (!entry.startsWith('chromium-')) continue

        // Playwright structure: chromium-<rev>/chrome-win/chrome.exe
        const chromeWin = join(this.chromiumDir, entry, 'chrome-win', 'chrome.exe')
        if (existsSync(chromeWin)) return chromeWin

        // Alternative: chromium-<rev>/chrome.exe
        const directInVersion = join(this.chromiumDir, entry, 'chrome.exe')
        if (existsSync(directInVersion)) return directInVersion
      }
    } catch {
      // Directory read failed — treat as not found
    }

    return null
  }

  /**
   * Downloads Chromium using Playwright's CLI.
   *
   * Sets PLAYWRIGHT_BROWSERS_PATH to our portable data directory
   * so downloads go to <userData>/chromium/ instead of the default
   * global location.
   */
  private downloadChromium(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Ensure the target directory exists
      if (!existsSync(this.chromiumDir)) {
        mkdirSync(this.chromiumDir, { recursive: true })
      }

      // Use Playwright's CLI to install just Chromium
      // The npx command resolves to the locally installed playwright package
      const playwrightPath = this.resolvePlaywrightCli()

      const env = {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: this.chromiumDir
      }

      const child = execFile(
        process.execPath, // node.exe
        [playwrightPath, 'install', 'chromium'],
        { env, timeout: 300000 }, // 5 min timeout
        (error, stdout, stderr) => {
          if (error) {
            console.error('[ChromiumBootstrap] Download failed:', stderr || error.message)
            reject(error)
          } else {
            console.log('[ChromiumBootstrap] Download complete:', stdout)
            resolve()
          }
        }
      )

      child.stdout?.on('data', (data: string) => {
        console.log('[ChromiumBootstrap]', data.toString().trim())
      })

      child.stderr?.on('data', (data: string) => {
        console.log('[ChromiumBootstrap]', data.toString().trim())
      })
    })
  }

  /**
   * Resolves the path to Playwright's CLI entry point.
   * In production, this is inside the app's node_modules.
   * In development, it's in the project's node_modules.
   */
  private resolvePlaywrightCli(): string {
    try {
      // Resolve from the app's node_modules
      return require.resolve('playwright/cli')
    } catch {
      // Fallback: try playwright-core
      try {
        return require.resolve('playwright-core/cli')
      } catch {
        throw new Error('Playwright CLI not found. Ensure playwright is installed as a dependency.')
      }
    }
  }
}
