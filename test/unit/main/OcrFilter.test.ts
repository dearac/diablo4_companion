import { describe, it, expect } from 'vitest'
import { isolateTooltip } from '../../../src/main/services/OcrFilter'
import type { OcrResult } from '../../../src/main/services/OcrService'

describe('OcrFilter', () => {
  it('should remove text that is outside horizontal bounds of the tooltip', () => {
    const rawOcr: OcrResult = {
      text: '...',
      lines: [
        {
          text: 'CHARACTER',
          words: [{ text: 'CHARACTER', bbox: { x: 500, y: 100, w: 100, h: 20 } }]
        },
        {
          text: 'Legendary Helm', // ANCHOR line
          words: [
            { text: 'Legendary', bbox: { x: 50, y: 150, w: 100, h: 20 } },
            { text: 'Helm', bbox: { x: 160, y: 150, w: 60, h: 20 } }
          ]
        },
        {
          text: '925 Item Power', // ANCHOR line
          words: [
            { text: '925', bbox: { x: 50, y: 180, w: 40, h: 20 } },
            { text: 'Item', bbox: { x: 100, y: 180, w: 50, h: 20 } },
            { text: 'Power', bbox: { x: 160, y: 180, w: 60, h: 20 } }
          ]
        },
        {
          text: '+100 Maximum Life', // ANCHOR line
          words: [{ text: '+100', bbox: { x: 50, y: 210, w: 40, h: 20 } }]
        },
        {
          text: '& Materials',
          words: [{ text: '&', bbox: { x: 600, y: 400, w: 100, h: 20 } }]
        }
      ]
    }

    const filtered = isolateTooltip(rawOcr)

    const filteredTexts = filtered.lines.map((l) => l.text)

    expect(filteredTexts).toContain('Legendary Helm')
    expect(filteredTexts).toContain('925 Item Power')
    expect(filteredTexts).toContain('+100 Maximum Life')

    // Garbage on the right should be dropped (anchor is x:50 to x:220)
    expect(filteredTexts).not.toContain('CHARACTER')
    expect(filteredTexts).not.toContain('& Materials')
  })

  it('should keep centered item names that are above the anchors', () => {
    const rawOcr: OcrResult = {
      text: '...',
      lines: [
        {
          text: 'HARLEQUIN CREST', // Item Name, bounded vertically close
          words: [{ text: 'HARLEQUIN', bbox: { x: 100, y: 100, w: 200, h: 25 } }]
        },
        {
          text: 'Unique Helm', // ANCHOR
          words: [{ text: 'Unique', bbox: { x: 50, y: 150, w: 100, h: 20 } }]
        }
      ]
    }

    const filtered = isolateTooltip(rawOcr)
    const filteredTexts = filtered.lines.map((l) => l.text)

    expect(filteredTexts).toContain('HARLEQUIN CREST')
    expect(filteredTexts).toContain('Unique Helm')
  })

  it('should remove vertical garbage that is too far above the anchor', () => {
    const rawOcr: OcrResult = {
      text: '...',
      lines: [
        {
          text: 'Title Selected', // Way too far above the anchor (Y=20)
          words: [{ text: 'Title', bbox: { x: 100, y: 20, w: 60, h: 20 } }]
        },
        {
          text: 'Unique Helm', // ANCHOR at Y=300
          words: [{ text: 'Unique', bbox: { x: 50, y: 300, w: 100, h: 20 } }]
        }
      ]
    }

    const filtered = isolateTooltip(rawOcr)
    const filteredTexts = filtered.lines.map((l) => l.text)

    expect(filteredTexts).not.toContain('Title Selected')
    expect(filteredTexts).toContain('Unique Helm')
  })

  it('should return unchanged if no anchor is found', () => {
    const rawOcr: OcrResult = {
      text: '...',
      lines: [
        {
          text: 'Just some text',
          words: [{ text: 'Just', bbox: { x: 100, y: 100, w: 100, h: 20 } }]
        }
      ]
    }

    const filtered = isolateTooltip(rawOcr)
    expect(filtered.lines).toHaveLength(1)
    expect(filtered.lines[0].text).toBe('Just some text')
  })
})
