import https from 'https'
import { IncomingMessage } from 'http'
import { createWriteStream, writeFileSync } from 'fs'
import { join } from 'path'

/**
 * Describes an available update found on GitHub Releases.
 */
export interface UpdateInfo {
  /** The new version string (without leading 'v') */
  version: string
  /** Release notes / changelog body from the GitHub release */
  releaseNotes: string
  /** Direct download URL for the exe asset */
  downloadUrl: string
}

/**
 * Handles checking for, downloading, and applying updates from a public
 * GitHub Releases repository. Designed for portable exe deployments where
 * electron-updater can't be used.
 *
 * Usage:
 *   const updater = new AutoUpdateService('dearac/diablo4-companion-releases')
 *   const update = await updater.checkForUpdate(app.getVersion())
 */
export class AutoUpdateService {
  private readonly apiUrl: string

  constructor(repo: string) {
    this.apiUrl = `https://api.github.com/repos/${repo}/releases/latest`
  }

  /**
   * Checks GitHub for a newer release than the current version.
   * Returns UpdateInfo if available, null otherwise.
   * Never throws — all errors result in null (silent fail).
   */
  async checkForUpdate(currentVersion: string): Promise<UpdateInfo | null> {
    try {
      console.log(`[AutoUpdate] Checking for updates... current version: ${currentVersion}`)
      console.log(`[AutoUpdate] API URL: ${this.apiUrl}`)
      const releaseJson = await this.fetchJson(this.apiUrl)
      if (!releaseJson) {
        console.log('[AutoUpdate] No release data returned from GitHub')
        return null
      }

      const tagVersion = releaseJson.tag_name?.replace(/^v/, '') || ''
      console.log(`[AutoUpdate] Latest release: ${tagVersion}`)

      if (!this.isNewer(tagVersion, currentVersion)) {
        console.log(`[AutoUpdate] ${tagVersion} is not newer than ${currentVersion}, skipping`)
        return null
      }

      // Find the exe asset
      const asset = releaseJson.assets?.find(
        (a: { name: string }) => a.name === 'diablo4_companion.exe'
      )

      if (!asset) {
        console.log('[AutoUpdate] No diablo4_companion.exe asset found in release')
        return null
      }

      console.log(`[AutoUpdate] Update available! ${currentVersion} -> ${tagVersion}`)
      console.log(`[AutoUpdate] Download URL: ${asset.browser_download_url}`)

      return {
        version: tagVersion,
        releaseNotes: releaseJson.body || '',
        downloadUrl: asset.browser_download_url || ''
      }
    } catch (err) {
      console.error('[AutoUpdate] Check failed with error:', err)
      return null
    }
  }

  /**
   * Simple semver comparison: returns true if remote > current.
   * Handles pre-release tags (e.g. 0.2.0-beta.1 < 0.2.0).
   */
  private isNewer(remote: string, current: string): boolean {
    const parseVersion = (v: string): { parts: number[]; pre: string } => {
      const [main, pre = ''] = v.split('-')
      const parts = main.split('.').map(Number)
      return { parts, pre }
    }

    const r = parseVersion(remote)
    const c = parseVersion(current)

    // Compare major.minor.patch
    for (let i = 0; i < Math.max(r.parts.length, c.parts.length); i++) {
      const rv = r.parts[i] || 0
      const cv = c.parts[i] || 0
      if (rv > cv) return true
      if (rv < cv) return false
    }

    // Same version numbers — pre-release < release
    if (c.pre && !r.pre) return true // current is pre-release, remote is release
    if (!c.pre && r.pre) return false // current is release, remote is pre-release

    return false // Same version
  }

  /**
   * Fetches JSON from a URL. Follows one redirect.
   * Returns null on any error.
   */
  private fetchJson(url: string): Promise<any | null> {
    return new Promise((resolve) => {
      const options = {
        headers: { 'User-Agent': 'Diablo4Companion-Updater' }
      }

      https
        .get(url, options, (res: IncomingMessage) => {
          // Follow one redirect
          if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
            this.fetchJson(res.headers.location).then(resolve)
            return
          }

          if (res.statusCode !== 200) {
            resolve(null)
            return
          }

          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => {
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString()))
            } catch {
              resolve(null)
            }
          })
        })
        .on('error', () => resolve(null))
    })
  }

  /**
   * Downloads the update exe to <appDir>/diablo4_companion.exe.update.
   * Calls onProgress with { percent, downloadedMB, totalMB } during download.
   */
  async downloadUpdate(
    downloadUrl: string,
    appDir: string,
    onProgress?: (progress: { percent: number; downloadedMB: number; totalMB: number }) => void
  ): Promise<string> {
    const destPath = join(appDir, 'diablo4_companion.exe.update')
    return this.downloadFile(downloadUrl, destPath, onProgress)
  }

  /**
   * Generates the update.bat script that swaps the exe after the current
   * process exits. Returns the path to the batch file.
   */
  generateUpdateScript(appDir: string, currentPid: number): string {
    const scriptPath = join(appDir, 'update.bat')
    const exeName = 'diablo4_companion.exe'
    const updateName = 'diablo4_companion.exe.update'

    const script = `@echo off
set RETRIES=0
:wait
tasklist /FI "PID eq ${currentPid}" 2>nul | find "${currentPid}" >nul
if not errorlevel 1 (
    set /a RETRIES+=1
    if %RETRIES% GEQ 30 exit /b 1
    timeout /t 1 /nobreak >nul
    goto wait
)
del "${join(appDir, exeName).replace(/\//g, '\\')}"
move "${join(appDir, updateName).replace(/\//g, '\\')}" "${join(appDir, exeName).replace(/\//g, '\\')}"
start "" "${join(appDir, exeName).replace(/\//g, '\\')}"
del "%~f0"
`
    writeFileSync(scriptPath, script, 'utf-8')
    return scriptPath
  }

  /**
   * Downloads a file from a URL, following redirects.
   * Reports progress via callback.
   */
  private downloadFile(
    url: string,
    destPath: string,
    onProgress?: (progress: { percent: number; downloadedMB: number; totalMB: number }) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const options = {
        headers: { 'User-Agent': 'Diablo4Companion-Updater' }
      }

      https
        .get(url, options, (res: IncomingMessage) => {
          // Follow redirects (GitHub serves assets via redirect)
          if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
            this.downloadFile(res.headers.location, destPath, onProgress)
              .then(resolve)
              .catch(reject)
            return
          }

          if (res.statusCode !== 200) {
            reject(new Error(`Download failed with status ${res.statusCode}`))
            return
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10)
          let downloadedBytes = 0

          const file = createWriteStream(destPath)
          res.on('data', (chunk: Buffer) => {
            downloadedBytes += chunk.length
            file.write(chunk)
            if (onProgress && totalBytes > 0) {
              onProgress({
                percent: Math.round((downloadedBytes / totalBytes) * 100),
                downloadedMB: Math.round((downloadedBytes / (1024 * 1024)) * 10) / 10,
                totalMB: Math.round((totalBytes / (1024 * 1024)) * 10) / 10
              })
            }
          })

          res.on('end', () => {
            file.end()
            resolve(destPath)
          })

          res.on('error', (err) => {
            file.end()
            reject(err)
          })
        })
        .on('error', reject)
    })
  }
}
