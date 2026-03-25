import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Use vi.hoisted() so the mock is available when vi.mock's factory is hoisted
const mockAutoUpdater = vi.hoisted(() => ({
  autoDownload: true,
  autoInstallOnAppQuit: false,
  on: vi.fn(),
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  quitAndInstall: vi.fn()
}))

vi.mock('electron-updater', () => ({
  autoUpdater: mockAutoUpdater
}))

// Mock electron
vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  app: { getVersion: vi.fn(() => '1.0.0') }
}))

import { AutoUpdateService } from '../../../src/main/services/AutoUpdateService'

describe('AutoUpdateService', () => {
  let service: AutoUpdateService
  let mockWindow: any

  beforeEach(() => {
    vi.restoreAllMocks()

    // Reset autoUpdater mock state
    mockAutoUpdater.autoDownload = true
    mockAutoUpdater.autoInstallOnAppQuit = false
    mockAutoUpdater.on = vi.fn()
    mockAutoUpdater.checkForUpdates = vi.fn().mockResolvedValue(undefined)
    mockAutoUpdater.downloadUpdate = vi.fn().mockResolvedValue(undefined)
    mockAutoUpdater.quitAndInstall = vi.fn()

    mockWindow = {
      webContents: {
        send: vi.fn()
      }
    }

    service = new AutoUpdateService(mockWindow)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should configure autoUpdater on construction', () => {
    expect(mockAutoUpdater.autoDownload).toBe(false)
    expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(true)
  })

  it('should register event listeners on construction', () => {
    const events = mockAutoUpdater.on.mock.calls.map((call: any[]) => call[0])
    expect(events).toContain('checking-for-update')
    expect(events).toContain('update-available')
    expect(events).toContain('update-not-available')
    expect(events).toContain('download-progress')
    expect(events).toContain('update-downloaded')
    expect(events).toContain('error')
  })

  it('should call checkForUpdates on autoUpdater', async () => {
    await service.checkForUpdates()
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled()
  })

  it('should not throw when checkForUpdates fails', async () => {
    mockAutoUpdater.checkForUpdates.mockRejectedValue(new Error('Network error'))
    await expect(service.checkForUpdates()).resolves.not.toThrow()
  })

  it('should call downloadUpdate on autoUpdater', async () => {
    await service.downloadUpdate()
    expect(mockAutoUpdater.downloadUpdate).toHaveBeenCalled()
  })

  it('should rethrow when downloadUpdate fails', async () => {
    mockAutoUpdater.downloadUpdate.mockRejectedValue(new Error('Download failed'))
    await expect(service.downloadUpdate()).rejects.toThrow('Download failed')
  })

  it('should call quitAndInstall on installUpdate', () => {
    service.installUpdate()
    expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalled()
  })

  it('should send update-available to renderer when update is found', () => {
    // Find the update-available handler registered during construction
    const updateAvailableCall = mockAutoUpdater.on.mock.calls.find(
      (call: any[]) => call[0] === 'update-available'
    )
    expect(updateAvailableCall).toBeDefined()

    // Simulate the event
    const handler = updateAvailableCall![1]
    handler({ version: '2.0.0', releaseNotes: 'New features!' })

    expect(mockWindow.webContents.send).toHaveBeenCalledWith('update-available', {
      version: '2.0.0',
      releaseNotes: 'New features!'
    })
  })

  it('should send update-downloaded to renderer when download completes', () => {
    const updateDownloadedCall = mockAutoUpdater.on.mock.calls.find(
      (call: any[]) => call[0] === 'update-downloaded'
    )
    expect(updateDownloadedCall).toBeDefined()

    const handler = updateDownloadedCall![1]
    handler({ version: '2.0.0' })

    expect(mockWindow.webContents.send).toHaveBeenCalledWith('update-downloaded', {
      version: '2.0.0'
    })
  })

  it('should send download progress to renderer', () => {
    const progressCall = mockAutoUpdater.on.mock.calls.find(
      (call: any[]) => call[0] === 'download-progress'
    )
    expect(progressCall).toBeDefined()

    const handler = progressCall![1]
    handler({
      percent: 50.5,
      transferred: 50 * 1024 * 1024,
      total: 100 * 1024 * 1024
    })

    expect(mockWindow.webContents.send).toHaveBeenCalledWith('update-download-progress', {
      percent: 51,
      downloadedMB: 50,
      totalMB: 100
    })
  })
})
