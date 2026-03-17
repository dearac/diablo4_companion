import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { BuildRepository } from '../../../src/main/services/BuildRepository'
import type { RawBuildData } from '../../../src/shared/types'

/** Minimal valid RawBuildData for testing */
function makeBuildData(name = 'Test Build'): RawBuildData {
  return {
    name,
    d4Class: 'Barbarian',
    level: 100,
    skills: [],
    paragonBoards: [],
    gearSlots: []
  }
}

describe('BuildRepository', () => {
  let tempDir: string
  let repo: BuildRepository

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'build-repo-'))
    repo = new BuildRepository(tempDir)
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('saves a build to disk and returns SavedBuild with id', () => {
    const data = makeBuildData('Whirlwind Barb')
    const saved = repo.save(data, 'https://maxroll.gg/d4/planner/123', 'maxroll')

    expect(saved.id).toContain('whirlwind-barb')
    expect(saved.sourceUrl).toBe('https://maxroll.gg/d4/planner/123')
    expect(saved.sourceSite).toBe('maxroll')
    expect(saved.data.name).toBe('Whirlwind Barb')
    expect(saved.importedAt).toBeTruthy()

    // Verify file exists on disk
    const filePath = join(tempDir, `${saved.id}.json`)
    expect(existsSync(filePath)).toBe(true)
  })

  it('listAll returns saved builds sorted newest first', () => {
    // Save two builds with different timestamps
    const first = repo.save(makeBuildData('First'), 'https://ex.com/1', 'maxroll')

    // Manually backdate the first build
    const firstFile = join(tempDir, `${first.id}.json`)
    const firstData = JSON.parse(readFileSync(firstFile, 'utf-8'))
    firstData.importedAt = '2020-01-01T00:00:00.000Z'
    writeFileSync(firstFile, JSON.stringify(firstData))

    const _second = repo.save(makeBuildData('Second'), 'https://ex.com/2', 'd4builds')

    const all = repo.listAll()
    expect(all.length).toBe(2)
    expect(all[0].data.name).toBe('Second') // Newer first
    expect(all[1].data.name).toBe('First')
  })

  it('load returns a build by ID', () => {
    const saved = repo.save(makeBuildData('Load Test'), 'https://ex.com', 'icy-veins')
    const loaded = repo.load(saved.id)

    expect(loaded).not.toBeNull()
    expect(loaded!.data.name).toBe('Load Test')
  })

  it('load returns null for unknown ID', () => {
    expect(repo.load('nonexistent')).toBeNull()
  })

  it('delete removes a build from disk', () => {
    const saved = repo.save(makeBuildData('Delete Me'), 'https://ex.com', 'maxroll')
    expect(repo.delete(saved.id)).toBe(true)
    expect(repo.load(saved.id)).toBeNull()
  })

  it('delete returns false for unknown ID', () => {
    expect(repo.delete('nonexistent')).toBe(false)
  })

  it('listAll returns empty array for empty directory', () => {
    expect(repo.listAll()).toEqual([])
  })

  it('listAll skips corrupt JSON files', () => {
    // Write a corrupt file
    writeFileSync(join(tempDir, 'bad.json'), 'not valid json}}}', 'utf-8')
    repo.save(makeBuildData('Good Build'), 'https://ex.com', 'maxroll')

    const all = repo.listAll()
    expect(all.length).toBe(1)
    expect(all[0].data.name).toBe('Good Build')
  })
})
