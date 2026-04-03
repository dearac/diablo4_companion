import type { OcrResult } from './OcrService'

/**
 * Regex patterns that strongly identify a line as belonging to the D4 tooltip body.
 */
const ANCHOR_REGEXES = [
  /Item\s*Power/i,
  /iP/i,
  /IP/i,
  /^[+×x*]\s*[\d.]+/i, // Affixes
  /Sockets?\s*\(?/i, // Sockets
  /^(Unique|Legendary|Rare|Ancestral|Bloodied)\s+/i // Rarity labels
]

/**
 * Filters out OCR noise (e.g., adjacent UI panels like the Character sheet)
 * by finding the primary geometric bounding box of the tooltip's body text
 * and discarding any text lines outside of that vertical/horizontal column.
 *
 * @param ocrResult Raw OCR result from WinOcr.exe
 * @returns Cleaned OcrResult with noise lines removed
 */
export function isolateTooltip(ocrResult: OcrResult): OcrResult {
  if (!ocrResult || !ocrResult.lines || ocrResult.lines.length === 0) {
    return ocrResult
  }

  // 1. Calculate boundaries for each line
  const lineBounds = ocrResult.lines
    .map((line) => {
      let minX = 99999
      let minY = 99999
      let maxX = -99999
      let maxY = -99999

      if (!line.words || line.words.length === 0) {
        return null
      }

      for (const w of line.words) {
        if (!w.bbox) continue
        if (w.bbox.x < minX) minX = w.bbox.x
        if (w.bbox.x + w.bbox.w > maxX) maxX = w.bbox.x + w.bbox.w
        if (w.bbox.y < minY) minY = w.bbox.y
        if (w.bbox.y + w.bbox.h > maxY) maxY = w.bbox.y + w.bbox.h
      }

      if (minX === 99999) return null

      return { line, minX, minY, maxX, maxY }
    })
    .filter((lb): lb is NonNullable<typeof lb> => lb !== null)

  // 2. Identify "Anchor Lines" that are confidently part of the tooltip
  const anchors = lineBounds.filter((lb) =>
    ANCHOR_REGEXES.some((regex) => regex.test(lb.line.text))
  )

  // If we can't find anchors, fail open and return everything
  if (anchors.length === 0) {
    return ocrResult
  }

  // 3. Compute the tooltip's inner bounding box (the main text column)
  const tooltipMinX = Math.min(...anchors.map((a) => a.minX))
  const tooltipMaxX = Math.max(...anchors.map((a) => Math.max(a.maxX, a.minX))) // max or min just in case
  const tooltipMinY = Math.min(...anchors.map((a) => a.minY))
  const tooltipMaxY = Math.max(...anchors.map((a) => Math.max(a.maxY, a.minY)))

  // 4. Pad the bounding box to capture Item Names (above) and Aspects/Flavor Text (below)
  const HORIZONTAL_PADDING = 120 // Generous width padding for long names/aspects pushing left or right
  const VERTICAL_TOP_PADDING = 200 // Item names can span ~3 lines above the first anchor
  const VERTICAL_BOT_PADDING = 350 // Aspects and bottom text can be much lower than the last anchor

  const validLeft = tooltipMinX - HORIZONTAL_PADDING
  const validRight = tooltipMaxX + HORIZONTAL_PADDING
  const validTop = tooltipMinY - VERTICAL_TOP_PADDING
  const validBottom = tooltipMaxY + VERTICAL_BOT_PADDING

  console.log(
    `[OCR-FILTER] Anchors Box: X(${tooltipMinX} - ${tooltipMaxX}), Y(${tooltipMinY} - ${tooltipMaxY})`
  )
  console.log(
    `[OCR-FILTER] Valid Box:   X(${validLeft} - ${validRight}), Y(${validTop} - ${validBottom})`
  )

  // 5. Filter out lines that miss this padded bounding region completely
  const filteredLines = lineBounds
    .filter((lb) => {
      // Is it entirely outside the horizontal column?
      if (lb.maxX < validLeft || lb.minX > validRight) {
        console.log(
          `[OCR-FILTER] Dropped (H): "${lb.line.text}" [X: ${lb.minX}-${lb.maxX}] outside [${validLeft}-${validRight}]`
        )
        return false
      }

      // Is it entirely outside the vertical column?
      if (lb.maxY < validTop || lb.minY > validBottom) {
        console.log(
          `[OCR-FILTER] Dropped (V): "${lb.line.text}" [Y: ${lb.minY}-${lb.maxY}] outside [${validTop}-${validBottom}]`
        )
        return false
      }

      return true
    })
    .map((lb) => lb.line)

  return {
    text: filteredLines.map((l) => l.text).join('\n'),
    lines: filteredLines
  }
}
