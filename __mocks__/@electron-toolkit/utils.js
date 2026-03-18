/**
 * Manual mock for '@electron-toolkit/utils'.
 * Used by Vitest to avoid needing the real electron runtime.
 */
module.exports = {
  is: {
    dev: true,
    production: false,
    mac: false,
    windows: true,
    linux: false
  },
  electronApp: {
    setAppUserModelId: () => {},
    setAutoLaunch: () => {}
  },
  optimizer: {
    watchWindowShortcuts: () => {}
  }
}
