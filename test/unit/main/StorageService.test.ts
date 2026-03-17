import { describe, it, expect } from 'vitest'
import { getDataPaths } from '../../../src/main/services/StorageService'

describe('StorageService', () => {
  it('should return all data paths relative to the base directory', () => {
    // Arrange: pick a fake base directory (Windows-style path for consistency)
    const baseDir = 'C:\\fake\\app'

    // Act: compute the paths
    const paths = getDataPaths(baseDir)

    // Assert: every path should be inside the base directory.
    // We use toContain because Windows uses backslashes (\) but
    // Unix uses forward slashes (/) — we just check the key segments.
    expect(paths.userData).toContain('data')
    expect(paths.builds).toContain('builds')
    expect(paths.classes).toContain('classes')
    expect(paths.icons).toContain('icons')
    expect(paths.scans).toContain('scans')
    expect(paths.config).toContain('config.json')

    // All paths must start with the base directory
    for (const p of Object.values(paths)) {
      expect(p.startsWith(baseDir)).toBe(true)
    }
  })

  it('should never reference %APPDATA% or any system directory', () => {
    const paths = getDataPaths('C:/MyPortableApp')

    // None of the paths should contain Windows system directories
    const allPaths = Object.values(paths)
    for (const p of allPaths) {
      expect(p).not.toContain('AppData')
      expect(p).not.toContain('Roaming')
      expect(p).not.toContain('Local')
      expect(p).not.toContain('%')
    }
  })
})
