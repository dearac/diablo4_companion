import { describe, it, expect } from 'vitest'
import { D4Build } from '../../../src/renderer/src/models/D4Build'

describe('D4Build', () => {
  it('should create a valid build with all required fields', () => {
    const build = new D4Build({
      name: 'Bash Barbarian',
      sourceUrl: 'https://maxroll.gg/d4/planner/x',
      sourceSite: 'maxroll',
      d4Class: 'Barbarian',
      level: 100
    })

    // Every build should get a unique ID automatically
    expect(build.id).toBeTruthy()
    expect(typeof build.id).toBe('string')

    // The fields we passed in should be set correctly
    expect(build.name).toBe('Bash Barbarian')
    expect(build.sourceUrl).toBe('https://maxroll.gg/d4/planner/x')
    expect(build.sourceSite).toBe('maxroll')
    expect(build.d4Class).toBe('Barbarian')
    expect(build.level).toBe(100)

    // These arrays start empty and get filled during import
    expect(build.skills).toEqual([])
    expect(build.gearSlots).toEqual([])
    expect(build.paragonBoards).toEqual([])

    // Import timestamp should be set
    expect(build.importedAt).toBeTruthy()
  })

  it('should reject an invalid source site', () => {
    expect(
      () =>
        new D4Build({
          name: 'Test',
          sourceUrl: 'x',
          sourceSite: 'unknown' as any,
          d4Class: 'Barbarian',
          level: 100
        })
    ).toThrow('Invalid source site')
  })

  it('should reject an invalid class', () => {
    expect(
      () =>
        new D4Build({
          name: 'Test',
          sourceUrl: 'x',
          sourceSite: 'maxroll',
          d4Class: 'Wizard' as any,
          level: 100
        })
    ).toThrow('Invalid class')
  })

  it('should generate unique IDs for different builds', () => {
    const build1 = new D4Build({
      name: 'Build A',
      sourceUrl: 'a',
      sourceSite: 'maxroll',
      d4Class: 'Barbarian',
      level: 100
    })

    const build2 = new D4Build({
      name: 'Build B',
      sourceUrl: 'b',
      sourceSite: 'maxroll',
      d4Class: 'Druid',
      level: 100
    })

    expect(build1.id).not.toBe(build2.id)
  })

  it('should accept all valid class names', () => {
    const classes = [
      'Barbarian',
      'Druid',
      'Necromancer',
      'Rogue',
      'Sorcerer',
      'Spiritborn',
      'Witch Doctor'
    ] as const

    for (const d4Class of classes) {
      const build = new D4Build({
        name: `${d4Class} Build`,
        sourceUrl: 'x',
        sourceSite: 'maxroll',
        d4Class,
        level: 100
      })
      expect(build.d4Class).toBe(d4Class)
    }
  })
})
