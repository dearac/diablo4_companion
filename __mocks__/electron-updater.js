/**
 * Manual mock for the 'electron-updater' module.
 *
 * Vitest loads this via the alias in vitest.config.ts.
 * Tests override individual methods with vi.fn() as needed.
 */
const EventEmitter = require('events')

const autoUpdater = Object.assign(new EventEmitter(), {
  autoDownload: true,
  autoInstallOnAppQuit: false,
  checkForUpdates: () => Promise.resolve(null),
  downloadUpdate: () => Promise.resolve([]),
  quitAndInstall: () => {}
})

module.exports = {
  autoUpdater
}
