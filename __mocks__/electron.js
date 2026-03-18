/**
 * Manual mock for the 'electron' module.
 *
 * Vitest loads this automatically when vi.mock('electron') is called,
 * but having it as a file also lets Vitest resolve the CommonJS
 * named-export issue that prevents mocking in-line.
 */
module.exports = {
  BrowserWindow: class BrowserWindow {
    constructor() {}
    loadURL() {}
    on() {}
    webContents: { send() {} }
  },
  app: {
    getPath: () => '/tmp',
    on: () => {},
    whenReady: () => Promise.resolve()
  },
  ipcMain: {
    handle: () => {},
    on: () => {}
  },
  ipcRenderer: {
    invoke: () => Promise.resolve(),
    on: () => {},
    send: () => {}
  }
}
