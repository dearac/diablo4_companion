import type { IParagonBoard } from '../../shared/types'

/**
 * Result of a board scan — the matched board index and what text matched.
 */
export interface BoardScanResult {
  boardIndex: number
  boardName: string
  matchedNodeName: string
  confidence: 'high' | 'medium' | 'low'
}

/**
 * BoardScanService matches OCR text from a paragon tooltip
 * against the currently loaded build's paragon boards.
 *
 * Strategy:
 * 1. Extract all "signature" node names from each board
 *    (legendary and rare nodes have unique, identifiable names)
 * 2. Check if any of those names appear in the OCR text
 * 3. Return the best match with confidence level
 */
export class BoardScanService {
  /**
   * Attempts to identify which paragon board the user is looking at.
   *
   * @param ocrText - The full OCR text from the screenshot
   * @param boards - The paragon boards from the loaded build
   * @returns The matched board, or null if no match found
   */
  matchBoard(ocrText: string, boards: IParagonBoard[]): BoardScanResult | null {
    if (!ocrText || boards.length === 0) return null

    const ocrLower = ocrText.toLowerCase()

    // Priority 0: "Paragon Starting Node" always means the starter board (index 0)
    if (ocrLower.includes('starting node') || ocrLower.includes('paragon starting')) {
      return {
        boardIndex: 0,
        boardName: boards[0].boardName,
        matchedNodeName: 'Paragon Starting Node',
        confidence: 'high'
      }
    }

    // Priority 1: Match legendary node names (most unique per board)
    for (let i = 0; i < boards.length; i++) {
      const board = boards[i]
      for (const node of board.allocatedNodes) {
        if (node.nodeType === 'legendary' && node.nodeName) {
          const nameLower = node.nodeName.toLowerCase()
          // Skip generic names that could match noise
          if (nameLower.length < 3) continue
          if (ocrLower.includes(nameLower)) {
            return {
              boardIndex: i,
              boardName: board.boardName,
              matchedNodeName: node.nodeName,
              confidence: 'high'
            }
          }
        }
      }
    }

    // Priority 2: Match rare node names (less unique but still identifiable)
    for (let i = 0; i < boards.length; i++) {
      const board = boards[i]
      for (const node of board.allocatedNodes) {
        if (node.nodeType === 'rare' && node.nodeName) {
          const nameLower = node.nodeName.toLowerCase()
          if (nameLower.length < 4) continue
          if (ocrLower.includes(nameLower)) {
            return {
              boardIndex: i,
              boardName: board.boardName,
              matchedNodeName: node.nodeName,
              confidence: 'medium'
            }
          }
        }
      }
    }

    // Priority 3: Match board name itself (e.g. "Starter Board")
    for (let i = 0; i < boards.length; i++) {
      const board = boards[i]
      if (board.boardName && board.boardName.length >= 3) {
        if (ocrLower.includes(board.boardName.toLowerCase())) {
          return {
            boardIndex: i,
            boardName: board.boardName,
            matchedNodeName: board.boardName,
            confidence: 'medium'
          }
        }
      }
    }

    // Priority 4: Fuzzy match — check for partial matches on longer names.
    // This handles OCR errors like "Castie" instead of "Castle".
    for (let i = 0; i < boards.length; i++) {
      const board = boards[i]
      for (const node of board.allocatedNodes) {
        if ((node.nodeType === 'legendary' || node.nodeType === 'rare') && node.nodeName) {
          const nameLower = node.nodeName.toLowerCase()
          if (nameLower.length < 5) continue
          // Check if at least 80% of the characters match consecutively
          if (fuzzyContains(ocrLower, nameLower, 0.8)) {
            return {
              boardIndex: i,
              boardName: board.boardName,
              matchedNodeName: node.nodeName,
              confidence: 'low'
            }
          }
        }
      }
    }

    return null
  }
}

/**
 * Fuzzy substring match — checks if `needle` appears in `haystack`
 * with at least `threshold` ratio of matching characters.
 *
 * Uses a sliding window approach: for each possible starting position
 * in the haystack, check how many characters of the needle match.
 */
function fuzzyContains(haystack: string, needle: string, threshold: number): boolean {
  const minMatches = Math.ceil(needle.length * threshold)

  for (let start = 0; start <= haystack.length - needle.length; start++) {
    let matches = 0
    for (let j = 0; j < needle.length; j++) {
      if (haystack[start + j] === needle[j]) {
        matches++
      }
    }
    if (matches >= minMatches) return true
  }

  return false
}
