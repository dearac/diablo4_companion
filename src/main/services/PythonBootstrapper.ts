/**
 * PythonBootstrapper — Auto-installs a portable Python + Tesseract environment.
 *
 * On first run (or if the environment is missing), this service:
 *   1. Downloads Python 3.12 Embeddable from python.org (~15 MB)
 *   2. Extracts it to `data/python/`
 *   3. Patches the ._pth file to enable site-packages
 *   4. Downloads and runs get-pip.py
 *   5. Installs dependencies from sidecar/requirements.txt
 *   6. Downloads Tesseract OCR from UB Mannheim (~50 MB)
 *   7. Silently installs it to `data/tesseract/`
 *
 * The entire process is idempotent — safe to call on every startup.
 * A status callback reports progress to the UI.
 *
 * The user never touches Python, pip, Tesseract, or any command line.
 */

import {
  existsSync,
  mkdirSync,
  createWriteStream,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync
} from 'fs'
import { join } from 'path'
import { execFile, execFileSync } from 'child_process'
import { get as httpsGet } from 'https'
import { get as httpGet } from 'http'

// ============================================================
// Configuration
// ============================================================

const PYTHON_VERSION = '3.12.10'
const PYTHON_ZIP_NAME = `python-${PYTHON_VERSION}-embed-amd64.zip`
const PYTHON_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/${PYTHON_ZIP_NAME}`
const GET_PIP_URL = 'https://bootstrap.pypa.io/get-pip.py'

// UB Mannheim Tesseract — the standard Windows build
const TESSERACT_VERSION = '5.4.0.20240606'
const TESSERACT_INSTALLER = `tesseract-ocr-w64-setup-${TESSERACT_VERSION}.exe`
const TESSERACT_URL = `https://github.com/UB-Mannheim/tesseract/releases/download/v${TESSERACT_VERSION}/${TESSERACT_INSTALLER}`

/** Progress stages reported to the UI */
export type BootstrapStage =
  | 'checking'
  | 'downloading-python'
  | 'extracting'
  | 'configuring'
  | 'installing-pip'
  | 'installing-deps'
  | 'downloading-tesseract'
  | 'installing-tesseract'
  | 'ready'
  | 'error'

export interface BootstrapProgress {
  stage: BootstrapStage
  message: string
  percent?: number
}

export type ProgressCallback = (progress: BootstrapProgress) => void

// ============================================================
// PythonBootstrapper
// ============================================================

export class PythonBootstrapper {
  /** Where the Python environment lives (e.g. `<appDir>/data/python/`) */
  private pythonDir: string

  /** Where Tesseract is installed (e.g. `<appDir>/data/tesseract/`) */
  private tesseractDir: string

  /** Where the sidecar scripts + requirements.txt live */
  private sidecarDir: string

  /** The top-level data directory */
  private dataDir: string

  /** Path to the portable python.exe once installed */
  private pythonExe: string

  /** Site-packages directory for installed libraries */
  private sitePackages: string

  /** A marker file that indicates setup completed successfully */
  private readyMarker: string

  constructor(dataDir: string, sidecarDir: string) {
    this.dataDir = dataDir
    this.pythonDir = join(dataDir, 'python')
    this.tesseractDir = join(dataDir, 'tesseract')
    this.sidecarDir = sidecarDir
    this.pythonExe = join(this.pythonDir, 'python.exe')
    this.sitePackages = join(this.pythonDir, 'Lib', 'site-packages')
    this.readyMarker = join(this.dataDir, '.bootstrap-complete')
  }

  /**
   * Returns the path to the portable python.exe.
   * Call `ensureReady()` first to guarantee it exists.
   */
  getPythonPath(): string {
    return this.pythonExe
  }

  /**
   * Returns the path to the portable tesseract.exe.
   */
  getTesseractPath(): string {
    return join(this.tesseractDir, 'tesseract.exe')
  }

  /**
   * Returns the tessdata directory path.
   */
  getTessdataDir(): string {
    return join(this.tesseractDir, 'tessdata')
  }

  /**
   * Returns true if the full environment (Python + Tesseract) is set up.
   */
  isReady(): boolean {
    return existsSync(this.readyMarker)
  }

  /**
   * Ensures the full environment is ready, bootstrapping if needed.
   * This is the main entry point — call it during app startup.
   *
   * @param onProgress - Callback for progress updates (shown in the UI)
   */
  async ensureReady(onProgress?: ProgressCallback): Promise<void> {
    const report = onProgress || ((): void => {})

    report({ stage: 'checking', message: 'Checking OCR environment...' })

    // Fast path: already set up
    if (this.isReady()) {
      report({ stage: 'ready', message: 'OCR environment ready' })
      return
    }

    console.log('[PythonBootstrapper] Environment missing, starting bootstrap...')

    try {
      // ---- Python Setup ----

      // Step 1: Download Python Embeddable
      if (!existsSync(this.pythonExe)) {
        await this.downloadPython(report)
      }

      // Step 2: Configure ._pth file for site-packages
      report({ stage: 'configuring', message: 'Configuring Python paths...' })
      this.configurePthFile()

      // Step 3: Install pip
      if (!existsSync(join(this.pythonDir, 'Scripts', 'pip.exe'))) {
        await this.installPip(report)
      }

      // Step 4: Install dependencies
      await this.installDependencies(report)

      // ---- Tesseract Setup ----

      // Step 5: Download and install Tesseract
      if (!existsSync(join(this.tesseractDir, 'tesseract.exe'))) {
        await this.installTesseract(report)
      }

      // Mark everything as complete
      writeFileSync(this.readyMarker, JSON.stringify({
        timestamp: new Date().toISOString(),
        pythonVersion: PYTHON_VERSION,
        tesseractVersion: TESSERACT_VERSION
      }))

      report({ stage: 'ready', message: 'OCR environment ready' })
      console.log('[PythonBootstrapper] Bootstrap complete')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      report({ stage: 'error', message: `Setup failed: ${message}` })
      throw error
    }
  }

  // ============================================================
  // Python Installation
  // ============================================================

  /**
   * Downloads and extracts the Python embeddable package.
   */
  private async downloadPython(report: ProgressCallback): Promise<void> {
    report({ stage: 'downloading-python', message: 'Downloading Python...', percent: 0 })

    mkdirSync(this.pythonDir, { recursive: true })

    const zipPath = join(this.pythonDir, PYTHON_ZIP_NAME)

    if (!existsSync(zipPath)) {
      await this.downloadFile(PYTHON_URL, zipPath, (percent) => {
        report({
          stage: 'downloading-python',
          message: `Downloading Python ${PYTHON_VERSION}... ${percent}%`,
          percent
        })
      })
    }

    report({ stage: 'extracting', message: 'Extracting Python...' })

    await this.runCommand('powershell', [
      '-NoProfile', '-Command',
      `Expand-Archive -Path '${zipPath}' -DestinationPath '${this.pythonDir}' -Force`
    ])

    try { unlinkSync(zipPath) } catch { /* non-critical */ }
  }

  /**
   * Patches the python._pth file to enable site-packages imports.
   */
  private configurePthFile(): void {
    const files = readdirSync(this.pythonDir)
    const pthFile = files.find((f) => f.endsWith('._pth'))

    if (!pthFile) {
      console.warn('[PythonBootstrapper] No ._pth file found, skipping config')
      return
    }

    const pthPath = join(this.pythonDir, pthFile)
    let content = readFileSync(pthPath, 'utf-8')

    content = content.replace(/^#\s*import site/m, 'import site')

    if (!content.includes('Lib\\site-packages')) {
      content = content.trimEnd() + '\nLib\\site-packages\n'
    }

    writeFileSync(pthPath, content)
    mkdirSync(this.sitePackages, { recursive: true })

    console.log(`[PythonBootstrapper] Configured ${pthFile}`)
  }

  /**
   * Downloads get-pip.py and installs pip into the portable Python.
   */
  private async installPip(report: ProgressCallback): Promise<void> {
    report({ stage: 'installing-pip', message: 'Installing pip...' })

    const getPipPath = join(this.pythonDir, 'get-pip.py')
    await this.downloadFile(GET_PIP_URL, getPipPath)

    await this.runCommand(this.pythonExe, [getPipPath, '--no-warn-script-location'], {
      PYTHONPATH: '',
      PYTHONHOME: ''
    })

    try { unlinkSync(getPipPath) } catch { /* non-critical */ }
    console.log('[PythonBootstrapper] pip installed')
  }

  /**
   * Installs project dependencies from requirements.txt.
   */
  private async installDependencies(report: ProgressCallback): Promise<void> {
    report({ stage: 'installing-deps', message: 'Installing OCR packages (opencv, numpy)...' })

    const reqPath = join(this.sidecarDir, 'requirements.txt')
    if (!existsSync(reqPath)) {
      throw new Error(`requirements.txt not found at ${reqPath}`)
    }

    await this.runCommand(
      this.pythonExe,
      ['-m', 'pip', 'install', '-r', reqPath, '--target', this.sitePackages, '--no-warn-script-location', '--quiet'],
      { PYTHONPATH: '', PYTHONHOME: '' }
    )

    console.log('[PythonBootstrapper] Dependencies installed')
  }

  // ============================================================
  // Tesseract Installation
  // ============================================================

  /**
   * Downloads and extracts Tesseract OCR.
   *
   * Strategy:
   * 1. Download the UB Mannheim NSIS installer (~50 MB)
   * 2. Find 7-Zip on the system (very common on gaming PCs) to extract it
   * 3. Clean up afterwards
   *
   * The NSIS installer requires admin to RUN, but 7z.exe can extract
   * it as a plain archive — no admin needed.
   */
  private async installTesseract(report: ProgressCallback): Promise<void> {
    report({ stage: 'downloading-tesseract', message: 'Downloading Tesseract OCR...', percent: 0 })

    mkdirSync(this.tesseractDir, { recursive: true })

    const installerPath = join(this.dataDir, TESSERACT_INSTALLER)

    // Step 1: Find 7-Zip on the system
    const sevenZipExe = this.find7Zip()
    if (!sevenZipExe) {
      throw new Error(
        'Tesseract installation requires 7-Zip to extract the installer. ' +
        'Please install 7-Zip from https://www.7-zip.org/ and restart the app.'
      )
    }
    console.log(`[PythonBootstrapper] Using 7-Zip: ${sevenZipExe}`)

    // Step 2: Download the Tesseract installer (~50 MB)
    if (!existsSync(installerPath)) {
      await this.downloadFile(TESSERACT_URL, installerPath, (percent) => {
        report({
          stage: 'downloading-tesseract',
          message: `Downloading Tesseract OCR... ${percent}%`,
          percent
        })
      })
    }

    // Step 3: Extract using 7z.exe (handles NSIS format)
    report({ stage: 'installing-tesseract', message: 'Extracting Tesseract OCR...' })

    await this.runCommand(sevenZipExe, [
      'x', installerPath,
      `-o${this.tesseractDir}`,
      '-y'
    ])

    // Clean up installer
    try { unlinkSync(installerPath) } catch { /* non-critical */ }

    // Verify installation
    const tessExe = join(this.tesseractDir, 'tesseract.exe')
    if (!existsSync(tessExe)) {
      throw new Error('Tesseract extraction failed: tesseract.exe not found')
    }

    const tessdata = join(this.tesseractDir, 'tessdata')
    if (!existsSync(tessdata)) {
      throw new Error('Tesseract extraction failed: tessdata directory not found')
    }

    console.log(`[PythonBootstrapper] Tesseract installed at ${this.tesseractDir}`)
  }

  /**
   * Searches for 7-Zip on the system in common locations.
   * Returns the path to 7z.exe if found, null otherwise.
   */
  private find7Zip(): string | null {
    const candidates = [
      // Standard install locations
      'C:\\Program Files\\7-Zip\\7z.exe',
      'C:\\Program Files (x86)\\7-Zip\\7z.exe',
      // PortableApps
      join(process.env.APPDATA || '', '..', 'Local', '7-Zip', '7z.exe'),
      // Scoop
      join(process.env.USERPROFILE || '', 'scoop', 'apps', '7zip', 'current', '7z.exe'),
      // Chocolatey
      join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'chocolatey', 'tools', '7z.exe'),
    ]

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate
      }
    }

    // Try PATH as last resort
    try {
      const result = execFileSync('where.exe', ['7z.exe'], {
        windowsHide: true,
        encoding: 'utf-8',
        timeout: 5000
      }).trim()
      if (result) return result.split('\n')[0].trim()
    } catch {
      // Not on PATH
    }

    return null
  }

  // ============================================================
  // Utilities
  // ============================================================

  /**
   * Downloads a file from a URL to a local path.
   * Follows HTTP redirects (301/302).
   */
  private downloadFile(
    url: string,
    destPath: string,
    onPercent?: (percent: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const getter = url.startsWith('https') ? httpsGet : httpGet

      const request = getter(url, (response) => {
        // Follow redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location
          if (redirectUrl) {
            this.downloadFile(redirectUrl, destPath, onPercent).then(resolve).catch(reject)
            return
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${response.statusCode} for ${url}`))
          return
        }

        const totalBytes = parseInt(response.headers['content-length'] || '0', 10)
        let downloadedBytes = 0

        const file = createWriteStream(destPath)
        response.pipe(file)

        if (totalBytes > 0 && onPercent) {
          response.on('data', (chunk: Buffer) => {
            downloadedBytes += chunk.length
            onPercent(Math.round((downloadedBytes / totalBytes) * 100))
          })
        }

        file.on('finish', () => {
          file.close()
          resolve()
        })

        file.on('error', (err) => {
          file.close()
          reject(err)
        })
      })

      request.on('error', reject)
      request.setTimeout(120_000, () => {
        request.destroy(new Error('Download timed out'))
      })
    })
  }

  /**
   * Runs a command and returns a promise that resolves when it exits.
   */
  private runCommand(
    cmd: string,
    args: string[],
    extraEnv?: Record<string, string>
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const env = { ...process.env, ...extraEnv }

      execFile(
        cmd, args,
        { env, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            console.error(`[PythonBootstrapper] Command failed: ${cmd} ${args.join(' ')}`)
            if (stderr) console.error(`  stderr: ${stderr}`)
            reject(new Error(`Command failed: ${error.message}\n${stderr}`))
            return
          }
          resolve(stdout)
        }
      )
    })
  }
}
