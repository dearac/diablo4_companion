import type { ScannedGearPiece } from '../../shared/types'

/**
 * GearParser converts raw OCR text lines from a Diablo 4 tooltip
 * into a structured ScannedGearPiece.
 *
 * Tooltip layout (typical):
 *   Line 0: Item Name (e.g., "Harlequin Crest")
 *   Line 1: Item Type + Slot (e.g., "Unique Helm", "Legendary Chest Armor")
 *   Line 2: Item Power (e.g., "925 Item Power")
 *   Lines 3+: Affixes, sockets, aspect, etc.
 */

/**
 * All known gear slots, sorted longest-first for greedy matching.
 * When the OCR reads "Legendary Chest Armor", we want to match
 * "Chest Armor" before "Chest".
 */
const GEAR_SLOTS = [
  'Chest Armor',
  'Two-Handed Sword',
  'Two-Handed Mace',
  'Two-Handed Axe',
  'Two-Handed Scythe',
  'Two-Handed Staff',
  'Helm',
  'Gloves',
  'Pants',
  'Boots',
  'Amulet',
  'Ring',
  'Shield',
  'Focus',
  'Totem',
  'Sword',
  'Mace',
  'Axe',
  'Dagger',
  'Scythe',
  'Wand',
  'Crossbow',
  'Bow',
  'Polearm',
  'Staff',
  'Chest'
].sort((a, b) => b.length - a.length)

/** Item type keywords that appear before the slot name */
const ITEM_TYPES: Array<{ keyword: string; type: ScannedGearPiece['itemType'] }> = [
  { keyword: 'Unique', type: 'Unique' },
  { keyword: 'Legendary', type: 'Legendary' },
  { keyword: 'Rare', type: 'Rare' }
]

/** Regex to extract item power from lines like "925 Item Power" or "1000 iP" */
const ITEM_POWER_REGEX = /(\d{3,4})\s*(?:Item\s*Power|iP|IP)/i

/** Regex to detect socket lines like "Socket (1)" or "Sockets (2)" or "Empty Socket" */
const SOCKET_REGEX = /Sockets?\s*(?:\((\d+)\)|(\d+))?/i

/** Regex to detect additive affixes like "+15.5% Crit Chance" */
const ADDITIVE_AFFIX_REGEX = /^[+]\s*[\d., ]*\d[\d., ]*%?\s+[A-Za-z].+/

/** Regex to detect multiplicative affixes like "×12% Vulnerable Damage" */
const MULTIPLICATIVE_AFFIX_REGEX = /^[×x]\s*[\d., ]*\d[\d., ]*%?\s+[A-Za-z].+/i

/** Regex to detect bare-number affixes like "10.8% Cooldown Reduction" or "217 All Resist" (no +/× prefix) */
const BARE_AFFIX_REGEX = /^[\d., ]*\d[\d., ]*%?\s+[A-Z].+/

/**
 * Regex for OCR-garbled affixes where the number runs directly into the stat name
 * with no space, e.g., "+3FaithOnKi11" or "+4FaithOnKi11".
 * Pattern: optional +, digits, then immediately an uppercase letter.
 */
const MERGED_AFFIX_REGEX = /^[+]?\d+[A-Z][a-zA-Z]/

/**
 * All known GA-like Unicode characters that OCR might produce.
 * Includes: ✦ (diamond star), ✧ (open star), ★☆⭐ (stars),
 * ♦◆◇ (diamonds), ✪✫✬✭✮✯ (star variants), ❖ (four diamond),
 * * (asterisk — OCR fallback), ⬦◈ (diamond variants).
 *
 * The `*` is safe to strip: D4 multiplicative affixes use `×` (Unicode),
 * never `*`. The only `*` in a tooltip is an OCR-hallucinated GA marker.
 */
const GA_CHARS = /[✦✧★☆⭐♦◆◇✪✫✬✭✮✯❖*⬦◈]/g
const GA_KEYWORD = /\bGreater\b/gi

/**
 * Scans a line for Greater Affix markers anywhere in the string
 * and strips them, returning a clean line for affix parsing.
 *
 * Unlike the old startsWith approach, this catches markers in
 * any position (leading, between +/× and the number, merged, etc.)
 *
 * @param line - A bullet-stripped tooltip line
 * @returns The cleaned line and whether a GA marker was detected
 */
export function sanitizeGreaterAffix(line: string): { cleaned: string; isGreater: boolean } {
  const hasGAChar = GA_CHARS.test(line)
  GA_CHARS.lastIndex = 0 // Reset global regex lastIndex

  const hasGAKeyword = GA_KEYWORD.test(line)
  GA_KEYWORD.lastIndex = 0

  const isGreater = hasGAChar || hasGAKeyword
  const cleaned = line
    .replace(GA_CHARS, '')
    .replace(GA_KEYWORD, '')
    .replace(/\s{2,}/g, ' ') // Collapse double-spaces from removed chars
    .trim()

  return { cleaned, isGreater }
}

/**
 * Leading bullet characters that D4 uses before affixes.
 * OCR may read ◆ as ·, •, o, or garbled characters like ÇÇó.
 * These must be stripped before affix regex matching.
 */
const BULLET_REGEX = /^[·•◆ÇÇóo᪥◈⬥⬦]\s*/

/** Regex to detect "Imprinted:" aspect lines in tooltips */
const IMPRINTED_REGEX = /^Imprinted:\s*(.+)/i

/**
 * Parses an array of OCR text lines from a tooltip into a ScannedGearPiece.
 *
 * @param lines - Array of text strings, one per OCR-detected line
 * @returns A structured ScannedGearPiece with all extractable fields
 */
interface MinimalOcrLine {
  text: string
  words?: { text: string; bbox: import('../../shared/types').OcrBBox }[]
}

export function parseTooltip(lines: string[] | MinimalOcrLine[]): ScannedGearPiece {
  const result: ScannedGearPiece = {
    slot: 'Unknown',
    itemName: '',
    itemType: 'Legendary',
    itemPower: 0,
    affixes: [],
    implicitAffixes: [],
    temperedAffixes: [],
    greaterAffixes: [],
    parsedAffixes: [], // Stores text and bbox for visual overlay
    sockets: 0,
    socketContents: [],
    aspect: null,
    rawText: lines.map((l) => (typeof l === 'string' ? l : l.text)).join('\n')
  }

  const getLineText = (line: string | MinimalOcrLine): string =>
    typeof line === 'string' ? line : line.text
  const getLineBBox = (
    line: string | MinimalOcrLine
  ): import('../../shared/types').OcrBBox | undefined => {
    if (typeof line === 'string' || !line.words || line.words.length === 0) return undefined

    let minX = 99999,
      minY = 99999,
      maxX = -99999,
      maxY = -99999
    for (const w of line.words) {
      if (!w.bbox) continue
      if (w.bbox.x < minX) minX = w.bbox.x
      if (w.bbox.x + w.bbox.w > maxX) maxX = w.bbox.x + w.bbox.w
      if (w.bbox.y < minY) minY = w.bbox.y
      if (w.bbox.y + w.bbox.h > maxY) maxY = w.bbox.y + w.bbox.h
    }

    if (minX === 99999) return undefined
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  }

  // ---- Find the tooltip within the full-screen OCR output ----
  // The type+slot line (e.g., "Unique Shield", "Legendary Ring") is the anchor.
  //
  // Problem: Slot names like "Shield" can appear in affix text (e.g.,
  // "Blessed Shield deals..."). We solve this with a two-pass approach:
  //   1. First pass: High-confidence — line must contain BOTH a rarity
  //      keyword (Unique/Legendary/Rare/Ancestral/Bloodied) AND a slot name.
  //   2. Second pass: Low-confidence fallback — line contains just a slot name.
  //      Only used if pass 1 finds nothing.
  let typeSlotLineIndex = -1
  const searchLimit = Math.min(20, lines.length)

  /** Rarity/type keywords that appear on the type+slot line */
  const TYPE_KEYWORDS = ['Unique', 'Legendary', 'Rare', 'Ancestral', 'Bloodied']

  /**
   * Returns true if a line should be skipped during the slot search
   * (affix lines, item power, noise, etc.).
   */
  const shouldSkipLine = (line: string): boolean => {
    if (/^[+×x*●•-]\s*[\d.]/.test(line)) return true
    if (ITEM_POWER_REGEX.test(line)) return true
    if (/(?:^\d|,|Armor)/i.test(line) && !/Chest Armor/i.test(line)) return true
    if (/^(?:CHARACTER|EQUIPPED|Stats|Materials|Equipment|Weapon\s+Dam)/i.test(line)) return true
    if (line.length <= 2) return true
    return false
  }

  // Pass 1: Find a line with BOTH a type keyword AND a slot name
  for (let i = 0; i < searchLimit; i++) {
    const line = getLineText(lines[i]).trim()
    if (shouldSkipLine(line)) continue

    const upper = line.toUpperCase()
    const hasTypeKeyword = TYPE_KEYWORDS.some((kw) => upper.includes(kw.toUpperCase()))
    if (!hasTypeKeyword) continue

    for (const slot of GEAR_SLOTS) {
      if (upper.includes(slot.toUpperCase())) {
        result.slot = slot
        typeSlotLineIndex = i
        break
      }
    }
    if (typeSlotLineIndex >= 0) break
  }

  // Pass 2 fallback: If no type+slot combo found, accept slot-only match
  // Search forward (first occurrence is more reliable than last)
  if (typeSlotLineIndex < 0) {
    for (let i = 0; i < searchLimit; i++) {
      const line = getLineText(lines[i]).trim()
      if (shouldSkipLine(line)) continue

      const upper = line.toUpperCase()
      for (const slot of GEAR_SLOTS) {
        if (upper.includes(slot.toUpperCase())) {
          result.slot = slot
          typeSlotLineIndex = i
          break
        }
      }
      if (typeSlotLineIndex >= 0) break
    }
  }

  // Look for rarity/type on the same line or the line above
  if (typeSlotLineIndex >= 0) {
    const searchLines = [getLineText(lines[typeSlotLineIndex])]
    if (typeSlotLineIndex > 0) searchLines.push(getLineText(lines[typeSlotLineIndex - 1]))

    for (const line of searchLines) {
      const upper = line.toUpperCase()
      for (const typeInfo of ITEM_TYPES) {
        if (upper.includes(typeInfo.keyword.toUpperCase())) {
          result.itemType = typeInfo.type
          break
        }
      }
    }
  }

  // ---- Item Name: line(s) immediately above the type+slot line ----
  // D4 item names can span 1–3 OCR lines (e.g., "VULGAR CHAIN" / "OF CELESTIAL" / "STRIFE")
  if (typeSlotLineIndex > 0) {
    const nameLineCandidates: string[] = []
    const maxLookback = Math.min(6, typeSlotLineIndex)

    for (let offset = 1; offset <= maxLookback; offset++) {
      const candidate = getLineText(lines[typeSlotLineIndex - offset]).trim()

      // STOP conditions (we reached above the name — character panel area)
      if (
        /^(?:EQUIPPED|CHARACTER)$/i.test(candidate) ||
        /Title\s*Selected/i.test(candidate) || // "No Title Selected"
        /^Is$/i.test(candidate)
      ) {
        break
      }

      // SKIP conditions (junk between name and slot, or crop noise)
      if (
        candidate.length === 0 ||
        candidate.length >= 35 ||
        candidate.length <= 4 || // Short garbage: "rial"(4), "iipc"(4), "CHAR"(4), "apcj"(4)
        /^[+×x]\s*[\d.]/.test(candidate) || // Affix line
        /^\d{3,4}\s/.test(candidate) || // Item power
        /Item Power/i.test(candidate) ||
        /Quality/i.test(candidate) ||
        /(?:^\d|,|Armor)/i.test(candidate) ||
        /Armory/i.test(candidate) ||
        /Loadout/i.test(candidate) ||
        /Slot\s*Transmog/i.test(candidate) || // "Slot Transmog: ON"
        /^Ed\s*Slot/i.test(candidate) || // Partial "Ed Slot" from crop
        /^ON$/i.test(candidate) || // "ON" from Transmog toggle
        /^\d+$/.test(candidate) || // Pure numbers like "163>"
        /^[^a-zA-Z]*$/.test(candidate) || // Lines with no letters (pure garbage)
        /[&]/.test(candidate) || // UI text like "& Materials"
        /[[\]]/.test(candidate) || // Crop artifacts like "CHARACTE]"
        (/^[a-z]+$/i.test(candidate) && !/[A-Z]/.test(candidate)) || // Pure lowercase ("iipc", "apcj")
        /Selected/i.test(candidate) || // "tle Selected", "Ile Selected"
        /^(?:ACTER|EARAC|iARAC|DEARAC|BRAWLER)/i.test(candidate) || // Known panel fragments
        /^EHE/i.test(candidate) // "EHEmENT" (garbled "ELEMENT")
      ) {
        continue // Skip this line, keep going up
      }

      // SKIP rarity descriptor lines like "Ancestral Bloodied Unique",
      // "Legendary", "Rare", etc. These sit between the slot line and the name.
      const candidateUpper = candidate.toUpperCase()
      const isRarityLine = ['UNIQUE', 'LEGENDARY', 'RARE', 'ANCESTRAL', 'BLOODIED'].some((kw) =>
        candidateUpper.includes(kw)
      )
      if (isRarityLine) {
        continue // Skip rarity descriptors, name is above
      }

      // If we didn't skip or stop, it's a name line!
      nameLineCandidates.unshift(candidate)

      // D4 item names span at most 3 OCR lines — stop once we have enough
      if (nameLineCandidates.length >= 3) break
    }

    result.itemName =
      nameLineCandidates.join(' ') || getLineText(lines[typeSlotLineIndex - 1]).trim()
  } else if (lines.length > 0) {
    // Fallback: first line
    result.itemName = getLineText(lines[0]).trim()
  }

  // ---- Item Power: search near the type+slot line ----
  const ipSearchStart = Math.max(0, typeSlotLineIndex - 3)
  const ipSearchEnd = Math.min(lines.length, typeSlotLineIndex + 8)
  for (let i = ipSearchStart; i < ipSearchEnd; i++) {
    const ipMatch = getLineText(lines[i]).match(ITEM_POWER_REGEX)
    if (ipMatch) {
      result.itemPower = parseInt(ipMatch[1], 10)
      break
    }
  }

  // Fallback: scan all lines if the window search missed it
  if (result.itemPower === 0) {
    for (let i = 0; i < lines.length; i++) {
      const ipMatch = getLineText(lines[i]).match(ITEM_POWER_REGEX)
      if (ipMatch) {
        result.itemPower = parseInt(ipMatch[1], 10)
        break
      }
    }
  }

  // ---- Body parsing (lines after the tooltip header) ----
  const bodyStart = typeSlotLineIndex >= 0 ? typeSlotLineIndex + 1 : 1

  const bodyLines: { text: string; bbox?: import('../../shared/types').OcrBBox }[] = []

  for (let i = bodyStart; i < lines.length; i++) {
    const lineObj = lines[i]
    const line = getLineText(lineObj).trim()
    const bbox = getLineBBox(lineObj)
    if (!line) continue

    // Detect terminal UI text that should never be merged
    const isTerminalText =
      /^(?:Account Bound|Unequip|Scroll|Mark|Unmark|Only|Item|Value|Classes:|Requires|Socket|Empty)/i.test(
        line
      )
    if (isTerminalText) {
      bodyLines.push({ text: line, bbox })
      continue
    }

    // Detect orphaned number (e.g. "1,199", "+1 15.5 %", "22.0%")
    const isOrphanedNumber =
      /^[+×x*]?\s*[\d]+\s*[,.]?\s*[\d]*\s*%?$/.test(line.replace(/\s+/g, '')) ||
      /^[+×x*]?\s*[\d., ]+%?$/.test(line)

    // A pure text line must be short to be considered an affix continuation, otherwise it's likely an aspect description
    const isTextOnly = /^[a-zA-Z\s]+$/.test(line) && line.trim().length <= 35

    // Stitching logic
    if (bodyLines.length > 0) {
      const prevLineInfo = bodyLines[bodyLines.length - 1]
      const prevLine = prevLineInfo.text

      // Case 1: The current line is a number, and the previous line was pure text.
      // E.g., prev: "Arbiter of Justice Cooldown", current: "22.0%"
      if (isOrphanedNumber && /^[a-zA-Z\s]+$/.test(prevLine)) {
        const num = /^[+×x*]/.test(line) ? line : `+${line}`
        bodyLines[bodyLines.length - 1].text = `${num} ${prevLine}`
        continue
      }

      // Case 2: The current line is an orphaned number, and the NEXT line is pure text.
      // E.g., current: "22.0%", next: "Arbiter of Justice Cooldown"
      if (isOrphanedNumber && i + 1 < lines.length) {
        const nextLine = getLineText(lines[i + 1]).trim()
        if (
          /^[a-zA-Z\s]+$/.test(nextLine) &&
          !/^(?:Account Bound|Unequip|Scroll|Mark|Unmark|Only|Item|Value|Classes:|Requires|Socket|Empty)/i.test(
            nextLine
          )
        ) {
          const num = /^[+×x*]/.test(line) ? line : `+${line}`
          bodyLines.push({ text: `${num} ${nextLine}`, bbox })
          i++ // skip the next line since we just merged it
          continue
        }
      }

      // Case 3: The current line is pure text, and it's a continuation of an affix or aspect.
      // E.g., prev: "+48.1% Chance for Blessed Shield to", current: "Deal Double Damage"
      // or prev: "+22.0% Arbiter of Justice Cooldown", current: "Reduction"
      if (isTextOnly) {
        const isPrevAffix = /^[+×x*]/.test(prevLine)
        const isPrevAspect =
          /^Imprinted:/i.test(prevLine) ||
          prevLine.includes('damage') ||
          prevLine.includes('stacks')
        if (isPrevAffix || isPrevAspect) {
          bodyLines[bodyLines.length - 1].text = `${prevLine} ${line}`
          continue
        }
      }
    }

    bodyLines.push({ text: line, bbox })
  }

  for (let i = 0; i < bodyLines.length; i++) {
    const { text: line, bbox } = bodyLines[i]
    if (!line) continue

    // Skip the item power line (already processed)
    if (ITEM_POWER_REGEX.test(line)) continue

    // Skip lines that just repeat the type keyword
    if (ITEM_TYPES.some((t) => line.includes(t.keyword))) continue

    // Skip Base Armor, Weapon Damage, and UI Comparison difference lines
    // Comparisons often look like "-21.2%", "-192)", or "Toughness)"
    // Base stats often look like "1,969 Armor (", "[190 - 286] Damage per Hit"
    if (/^(?:[\d.,]+\s*Armor\b(?!.*[+×x*]))/i.test(line)) continue
    if (/(?:Damage Per Second)|(?:Damage per Hit)|(?:Attacks per Second)/i.test(line)) continue
    if (/(?:Toughness\))|(?:^-\d)|(?:^\[\d+)/i.test(line)) continue
    // Also skip split off comparisons like "-192)"
    if (/^-\d+[.,]?\d*[%]?\)?$/.test(line.replace(/\s+/g, ''))) continue

    // Strip leading bullet characters (·, •, ◆, etc.) that D4 uses before affixes
    let cleanLine = line.replace(BULLET_REGEX, '')

    // Greedy GA sanitizer — scans entire line for GA-like Unicode characters
    const { cleaned: gaCleanedLine, isGreater } = sanitizeGreaterAffix(cleanLine)
    cleanLine = gaCleanedLine

    // Socket detection
    const socketMatch = cleanLine.match(SOCKET_REGEX)
    if (socketMatch) {
      const count = socketMatch[1] || socketMatch[2]
      if (count) {
        // Explicit count like "Sockets (2)" — use it directly
        result.sockets = parseInt(count, 10)
      } else {
        // Individual socket line like "Empty Socket" — increment
        result.sockets += 1
      }

      // Check for socket contents like "Empty Socket" or gem names
      if (cleanLine.toLowerCase().includes('empty')) {
        result.socketContents.push('Empty')
      }
      continue
    }

    // Affix detection — additive (+), multiplicative (×), or bare number (10.8% ...)
    // Aspect detection — "Imprinted:" lines contain the item's aspect
    const imprintMatch = cleanLine.match(IMPRINTED_REGEX)
    if (imprintMatch) {
      result.aspect = { name: imprintMatch[1].trim(), description: cleanLine }
      continue
    }

    if (
      ADDITIVE_AFFIX_REGEX.test(cleanLine) ||
      MULTIPLICATIVE_AFFIX_REGEX.test(cleanLine) ||
      BARE_AFFIX_REGEX.test(cleanLine) ||
      MERGED_AFFIX_REGEX.test(cleanLine)
    ) {
      // Normalize: ensure the affix string starts with + for consistency
      const normalizedAffix = /^[+×x]/.test(cleanLine) ? cleanLine : `+${cleanLine}`
      result.affixes.push(normalizedAffix)

      // Store the parsed affix with its original bounding box for overlay rendering
      result.parsedAffixes.push({ text: normalizedAffix, bbox })

      if (isGreater) {
        // Extract the affix name without the numeric prefix for greater affix tracking
        const nameMatch = normalizedAffix.match(/^[+×x]\s*[\d., ]*\d[\d., ]*%?\s+(.+)/i)
        if (nameMatch) {
          result.greaterAffixes.push(nameMatch[1].trim())
        }
      }
    }
  }

  return result
}
