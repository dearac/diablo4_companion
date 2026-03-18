import https from 'https'
import { IncomingMessage } from 'http'

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

  constructor(private readonly repo: string) {
    this.apiUrl = `https://api.github.com/repos/${repo}/releases/latest`
  }

  /**
   * Checks GitHub for a newer release than the current version.
   * Returns UpdateInfo if available, null otherwise.
   * Never throws — all errors result in null (silent fail).
   */
  async checkForUpdate(currentVersion: string): Promise<UpdateInfo | null> {
    try {
      const releaseJson = await this.fetchJson(this.apiUrl)
      if (!releaseJson) return null

      const tagVersion = releaseJson.tag_name?.replace(/^v/, '') || ''
      if (!this.isNewer(tagVersion, currentVersion)) return null

      // Find the exe asset
      const asset = releaseJson.assets?.find(
        (a: { name: string }) => a.name === 'diablo4_companion.exe'
      )

      return {
        version: tagVersion,
        releaseNotes: releaseJson.body || '',
        downloadUrl: asset?.browser_download_url || ''
      }
    } catch {
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
    if (c.pre && !r.pre) return true  // current is pre-release, remote is release
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

      https.get(url, options, (res: IncomingMessage) => {
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
      }).on('error', () => resolve(null))
    })
  }
}
