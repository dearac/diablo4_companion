import { existsSync, readFileSync, unlinkSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AutoUpdateService } from '../../../src/main/services/AutoUpdateService'
import https from 'https'
import { EventEmitter } from 'events'

// Mock https module
vi.mock('https', () => ({
  default: { get: vi.fn() },
  get: vi.fn()
}))

/** Creates a fake https.get response with the given status code and body */
function mockHttpsGet(
  statusCode: number,
  body: string,
  headers: Record<string, string> = {}
): void {
  const mockResponse = new EventEmitter() as any
  mockResponse.statusCode = statusCode
  mockResponse.headers = headers
  vi.mocked(https.get).mockImplementation((_url: any, _opts: any, cb: any) => {
    // Handle both (url, cb) and (url, opts, cb) signatures
    const callback = typeof _opts === 'function' ? _opts : cb
    process.nextTick(() => {
      callback(mockResponse)
      process.nextTick(() => {
        mockResponse.emit('data', Buffer.from(body))
        mockResponse.emit('end')
      })
    })
    const req = new EventEmitter() as any
    req.end = vi.fn()
    return req
  })
}

/** Creates a redirect response */
function mockHttpsRedirect(location: string): void {
  mockHttpsGet(302, '', { location })
}

describe('AutoUpdateService', () => {
  let service: AutoUpdateService

  beforeEach(() => {
    vi.restoreAllMocks()
    service = new AutoUpdateService('dearac/diablo4-companion-releases')
  })

  describe('checkForUpdate()', () => {
    it('should detect a newer version', async () => {
      const release = {
        tag_name: 'v1.0.0',
        body: 'Bug fixes and improvements',
        assets: [
          { name: 'diablo4_companion.exe', browser_download_url: 'https://example.com/dl.exe' }
        ]
      }
      mockHttpsGet(200, JSON.stringify(release))

      const result = await service.checkForUpdate('0.2.0-beta.1')
      expect(result).not.toBeNull()
      expect(result!.version).toBe('1.0.0')
      expect(result!.releaseNotes).toBe('Bug fixes and improvements')
      expect(result!.downloadUrl).toBe('https://example.com/dl.exe')
    })

    it('should return null when already on latest', async () => {
      const release = { tag_name: 'v0.2.0-beta.1', body: '', assets: [] }
      mockHttpsGet(200, JSON.stringify(release))

      const result = await service.checkForUpdate('0.2.0-beta.1')
      expect(result).toBeNull()
    })

    it('should return null when on a newer version', async () => {
      const release = { tag_name: 'v0.1.0', body: '', assets: [] }
      mockHttpsGet(200, JSON.stringify(release))

      const result = await service.checkForUpdate('0.2.0')
      expect(result).toBeNull()
    })

    it('should return null on network error (silent fail)', async () => {
      vi.mocked(https.get).mockImplementation((_url: any, _opts: any, _cb: any) => {
        const req = new EventEmitter() as any
        req.end = vi.fn()
        process.nextTick(() => req.emit('error', new Error('ENOTFOUND')))
        return req
      })

      const result = await service.checkForUpdate('0.2.0')
      expect(result).toBeNull()
    })

    it('should return null on non-200 response (no releases)', async () => {
      mockHttpsGet(404, 'Not Found')

      const result = await service.checkForUpdate('0.2.0')
      expect(result).toBeNull()
    })
  })

  describe('generateUpdateScript()', () => {
    let tempDir: string

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'updater-test-'))
    })

    it('should generate a valid batch script', () => {
      const scriptPath = service.generateUpdateScript(tempDir, 12345)

      expect(existsSync(scriptPath)).toBe(true)
      const content = readFileSync(scriptPath, 'utf-8')
      expect(content).toContain('12345')
      expect(content).toContain('diablo4_companion.exe')
      expect(content).toContain('diablo4_companion.exe.update')

      unlinkSync(scriptPath)
    })
  })
})
