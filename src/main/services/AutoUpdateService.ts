import { autoUpdater, type UpdateInfo } from 'electron-updater'
import { BrowserWindow, app } from 'electron'

// ============================================================
// AutoUpdateService — NSIS auto-updates via electron-updater
// ============================================================
// Uses electron-updater to check GitHub Releases for new NSIS
// installers. Downloads in the background and installs on quit.
//
// The publish config in electron-builder.yml (provider: github)
// tells electron-updater where to look for updates.
//
// Usage:
//   const updater = new AutoUpdateService(mainWindow)
//   updater.checkForUpdates()
// ============================================================

/**
 * Manages automatic updates using electron-updater.
 * Checks GitHub Releases for new NSIS installers, downloads
 * them in the background, and installs on app quit.
 */
export class AutoUpdateService {
  private mainWindow: BrowserWindow

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
    this.configure()
  }

  /**
   * Configures electron-updater behavior and event listeners.
   */
  private configure(): void {
    // Don't auto-download — let the user decide
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    // ---- Event Handlers ----

    autoUpdater.on('checking-for-update', () => {
      console.log('[AutoUpdate] Checking for updates...')
    })

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      console.log(`[AutoUpdate] Update available: v${info.version}`)
      this.mainWindow.webContents.send('update-available', {
        version: info.version,
        releaseNotes: info.releaseNotes || 'Bug fixes and improvements.'
      })
    })

    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      console.log(`[AutoUpdate] Already up to date: v${info.version}`)
    })

    autoUpdater.on('download-progress', (progress) => {
      console.log(
        `[AutoUpdate] Download: ${progress.percent.toFixed(1)}% ` +
          `(${(progress.transferred / 1024 / 1024).toFixed(1)} / ` +
          `${(progress.total / 1024 / 1024).toFixed(1)} MB)`
      )
      this.mainWindow.webContents.send('update-download-progress', {
        percent: Math.round(progress.percent),
        downloadedMB: Math.round((progress.transferred / (1024 * 1024)) * 10) / 10,
        totalMB: Math.round((progress.total / (1024 * 1024)) * 10) / 10
      })
    })

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      console.log(`[AutoUpdate] Update downloaded: v${info.version}`)
      this.mainWindow.webContents.send('update-downloaded', {
        version: info.version
      })
    })

    autoUpdater.on('error', (err) => {
      console.error('[AutoUpdate] Error:', err.message)
      // Silent fail — don't bother the user with update errors
    })
  }

  /**
   * Checks for available updates on GitHub Releases.
   * If an update is found, sends 'update-available' to the renderer.
   * The renderer should call downloadUpdate() if the user agrees.
   */
  async checkForUpdates(): Promise<void> {
    try {
      console.log(`[AutoUpdate] Current version: v${app.getVersion()}`)
      await autoUpdater.checkForUpdates()
    } catch (err) {
      console.error('[AutoUpdate] Check failed:', err)
      // Silent fail — app continues normally
    }
  }

  /**
   * Downloads the available update.
   * Progress is reported via 'update-download-progress' events.
   * When complete, 'update-downloaded' is sent to the renderer.
   */
  async downloadUpdate(): Promise<void> {
    try {
      await autoUpdater.downloadUpdate()
    } catch (err) {
      console.error('[AutoUpdate] Download failed:', err)
      throw err
    }
  }

  /**
   * Quits the app and installs the downloaded update.
   * The NSIS installer runs silently and relaunches the app.
   */
  installUpdate(): void {
    autoUpdater.quitAndInstall()
  }
}
