import { describe, it, expect } from 'vitest'
import { parseOcrOutput } from '../../../src/main/services/OcrService'

describe('OcrService', () => {
  describe('parseOcrOutput', () => {
    it('should parse valid JSON output from WinOcr.exe', () => {
      const raw = JSON.stringify({
        text: 'Harlequin Crest\nUnique Helm\n925 Item Power',
        lines: [
          { text: 'Harlequin Crest', words: [] },
          { text: 'Unique Helm', words: [] },
          { text: '925 Item Power', words: [] }
        ]
      })

      const result = parseOcrOutput(raw)

      expect(result.text).toBe('Harlequin Crest\nUnique Helm\n925 Item Power')
      expect(result.lines).toHaveLength(3)
      expect(result.lines[0].text).toBe('Harlequin Crest')
    })

    it('should parse words with bounding boxes', () => {
      const raw = JSON.stringify({
        text: 'Hello World',
        lines: [
          {
            text: 'Hello World',
            words: [
              { text: 'Hello', bbox: { x: 10, y: 20, w: 50, h: 15 } },
              { text: 'World', bbox: { x: 70, y: 20, w: 55, h: 15 } }
            ]
          }
        ]
      })

      const result = parseOcrOutput(raw)

      expect(result.lines[0].words).toHaveLength(2)
      expect(result.lines[0].words[0].text).toBe('Hello')
      expect(result.lines[0].words[0].bbox.x).toBe(10)
    })

    it('should handle missing fields gracefully', () => {
      const raw = JSON.stringify({ text: 'test', lines: [{ text: 'line1' }] })
      const result = parseOcrOutput(raw)

      expect(result.text).toBe('test')
      expect(result.lines[0].words).toEqual([])
    })

    it('should throw on invalid JSON', () => {
      expect(() => parseOcrOutput('not json')).toThrow('Failed to parse OCR output')
    })

    it('should throw on empty output', () => {
      expect(() => parseOcrOutput('')).toThrow('OCR output is empty')
    })

    it('should throw on whitespace-only output', () => {
      expect(() => parseOcrOutput('   ')).toThrow('OCR output is empty')
    })
  })
})
