import { describe, it, expect } from 'vitest'
import { parseTooltip } from '../../../src/main/services/GearParser'

describe('GearParser', () => {
  it('should parse a basic unique helm tooltip', () => {
    const lines = [
      'Harlequin Crest',
      'Unique Helm',
      '925 Item Power',
      '+100 Maximum Life',
      '+15.5% Critical Strike Chance',
      '+12% Vulnerable Damage',
      'Socket (1)'
    ]

    const result = parseTooltip(lines)

    expect(result.itemName).toBe('Harlequin Crest')
    expect(result.slot).toBe('Helm')
    expect(result.itemType).toBe('Unique')
    expect(result.itemPower).toBe(925)
    expect(result.affixes).toContain('+15.5% Critical Strike Chance')
    expect(result.affixes).toContain('+12% Vulnerable Damage')
    expect(result.sockets).toBe(1)
  })

  it('should detect item type and slot from header lines', () => {
    const lines = ['Ring of Starless Skies', 'Unique Ring', '800 Item Power']
    const result = parseTooltip(lines)

    expect(result.slot).toBe('Ring')
    expect(result.itemType).toBe('Unique')
  })

  it('should match Chest Armor before shorter slots', () => {
    const lines = ["Tyrael's Might", 'Unique Chest Armor', '925 Item Power']
    const result = parseTooltip(lines)

    expect(result.slot).toBe('Chest Armor')
  })

  it('should extract item power with various formats', () => {
    expect(parseTooltip(['Test', 'Legendary Helm', '925 Item Power']).itemPower).toBe(925)
    expect(parseTooltip(['Test', 'Rare Helm', '1000 iP']).itemPower).toBe(1000)
    expect(parseTooltip(['Test', 'Legendary Helm', '800 IP']).itemPower).toBe(800)
  })

  it('should exclude rarity keywords when extracting multi-line item names', () => {
    const lines = [
      'EQUIPPED',
      'MANTLE OF THE',
      'GREY * *',
      'Ancestral Bloodied Unique',
      'Chest Armor',
      '800 Item Power'
    ]
    const result = parseTooltip(lines)
    expect(result.itemName).toBe('MANTLE OF THE GREY * *')
    expect(result.slot).toBe('Chest Armor')
    expect(result.itemType).toBe('Unique')
  })

  it('should return 0 sockets when none present', () => {
    const lines = ['Test', 'Legendary Helm', '800 Item Power', '+5 Strength']
    const result = parseTooltip(lines)
    expect(result.sockets).toBe(0)
  })

  it('should detect greater affixes with star marker', () => {
    const lines = [
      'Test Helm',
      'Legendary Helm',
      '925 Item Power',
      '⭐ +15.5% Critical Strike Chance'
    ]
    const result = parseTooltip(lines)
    expect(result.greaterAffixes).toContain('Critical Strike Chance')
    expect(result.affixes).toContain('+15.5% Critical Strike Chance')
  })

  it('should parse multiple affixes', () => {
    const lines = [
      'Test Gloves',
      'Legendary Gloves',
      '900 Item Power',
      '+10% Critical Strike Chance',
      '+12% Attack Speed',
      '×15% Vulnerable Damage',
      '+100 Maximum Life'
    ]
    const result = parseTooltip(lines)
    expect(result.affixes).toHaveLength(4)
  })

  it('should handle socket count in parentheses', () => {
    const lines = ['Test', 'Legendary Helm', '800 Item Power', 'Sockets (2)']
    const result = parseTooltip(lines)
    expect(result.sockets).toBe(2)
  })

  it('should set rawText to joined lines', () => {
    const lines = ['Line 1', 'Line 2']
    const result = parseTooltip(lines)
    expect(result.rawText).toBe('Line 1\nLine 2')
  })

  it('should default to Unknown slot when not detected', () => {
    const lines = ['Some Random Text', 'More Text']
    const result = parseTooltip(lines)
    expect(result.slot).toBe('Unknown')
  })

  // ---- Bug fix tests (from live integration test session) ----

  it('should extract aspect from "Imprinted:" lines', () => {
    const lines = [
      'VIRTUOUS EXCEPTIONAL GLOVES',
      'Bloodied Legendary Gloves',
      '750 Item Power',
      '+244 Maximum Life [244 - 272]',
      '+9.5% Attack speed [8.3 - 10.01%',
      'Imprinted: Using a Valor skill increases your damage by [40.0 - 60.01% for 7 seconds.',
      'Requires Level 60'
    ]
    const result = parseTooltip(lines)
    expect(result.aspect).not.toBeNull()
    expect(result.aspect!.name).toContain('Using a Valor skill')
  })

  it('should keep aspect null when no "Imprinted:" line is present', () => {
    const lines = [
      'Test Helm',
      'Legendary Helm',
      '925 Item Power',
      '+100 Maximum Life'
    ]
    const result = parseTooltip(lines)
    expect(result.aspect).toBeNull()
  })

  it('should parse no-space OCR affixes like "+3FaithOnKi11"', () => {
    const lines = [
      'Test Ring',
      'Legendary Ring',
      '800 Item Power',
      '+165 Life On Hit [146-159]',
      '+3FaithOnKi11',
      '+6.4% Critical Strike Chance [5.2 -'
    ]
    const result = parseTooltip(lines)
    // The no-space affix should be captured (not silently dropped)
    expect(result.affixes.some((a) => a.includes('Faith'))).toBe(true)
  })

  it('should find item power even when far from slot line', () => {
    // Simulates garbled OCR where IP line is distant from the type+slot line
    const lines = [
      'ACTER',
      'Ile',
      'Igh',
      'ner',
      'DREAD mACE OF',
      'EXORCIsm *',
      'Ancestral Bloodied',
      'Legendary Two-Handed Mace',
      '800 Item Power',
      '+130.0% Overpower Damage'
    ]
    const result = parseTooltip(lines)
    expect(result.itemPower).toBe(800)
  })

  it('should accumulate sockets from individual "Empty Socket" lines', () => {
    const lines = [
      'Test Armor',
      'Legendary Chest Armor',
      '800 Item Power',
      '+118 Strength +[107-121]',
      'Empty Socket',
      'Empty Socket'
    ]
    const result = parseTooltip(lines)
    expect(result.sockets).toBe(2)
  })

  // ---- Bug fix: Garbage name prefix stripping (live audit session) ----

  it('should strip garbage OCR prefix from "rial REVELATOR\'S Doom GAUNTLETS"', () => {
    const lines =
      "'Cted\nrial\n1.2\nREVELATOR'S\nDoom GAUNTLETS\nLegendary Gloves\n750 Item Power\n562 Armor ( 2% Toughness)\n+98 Strength +[89-99]\n+266 Maximum Life [244 - 272]".split(
        '\n'
      )
    const result = parseTooltip(lines)
    expect(result.slot).toBe('Gloves')
    expect(result.itemName).not.toContain('rial')
    expect(result.itemName).toContain("REVELATOR'S")
  })

  it('should strip "& Materials" UI noise from item name', () => {
    const lines =
      "ACTER\nEARAC\ntle Selected\n& Materials\nRAPID Doom\napcj\nLegendary Gloves\n750 Item Power\n+96 Strength +[89 - 99]\n+88 Life OnHit [84-92]".split(
        '\n'
      )
    const result = parseTooltip(lines)
    expect(result.slot).toBe('Gloves')
    expect(result.itemName).not.toContain('Materials')
    expect(result.itemName).not.toContain('ACTER')
  })

  it('should strip "CHARACTE]" crop artifact from "FISTS OF FATE"', () => {
    const lines =
      "CHARACTE]\nFISTS OF FATE\nUnique Gloves\n750 Item Power\n562 Armor\n+3.6% Attack speed [0.1-8.71%\n+5.6% Critical Strike Chance [0.1 -".split(
        '\n'
      )
    const result = parseTooltip(lines)
    expect(result.slot).toBe('Gloves')
    expect(result.itemName).not.toContain('CHARACTE')
    expect(result.itemName).toContain('FISTS OF FATE')
  })

  it('should strip "iipc" and other garbage from multi-line name', () => {
    const lines =
      "ACTER\niARAC\nIle Selected\nEHEmENT\nBRAWLER'S\niipc\nIgh\nIce\nnev\nADVENTURER'S\nGLOVES *\nAncestral Legendary Gloves\n800 Item Power\n754 Armor (+1.8% Toughness)\n+437 Maximum Life [424 - 457]".split(
        '\n'
      )
    const result = parseTooltip(lines)
    expect(result.slot).toBe('Gloves')
    expect(result.itemName).not.toContain('iipc')
    expect(result.itemName).not.toContain('BRAWLER')
    expect(result.itemName).toContain("ADVENTURER'S")
    expect(result.itemName).toContain('GLOVES')
  })

  it('should produce clean name for "CHAR DAWN FIRE" → "DAWN FIRE"', () => {
    const lines =
      "CHAR\nDAWN FIRE\nUnique Gloves\n750 Item Power\n562 Armor\n+83 Strength +[73-831\n+244 Maximum Life [244 - 2721".split(
        '\n'
      )
    const result = parseTooltip(lines)
    expect(result.slot).toBe('Gloves')
    // "CHAR" is a 4-char fragment from "CHARACTER" panel text — should be stripped
    expect(result.itemName).not.toMatch(/^CHAR\b/)
    expect(result.itemName).toContain('DAWN FIRE')
  })
})
