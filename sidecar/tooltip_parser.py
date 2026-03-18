"""
tooltip_parser.py — Parse raw OCR text into structured item data.

Converts the raw text output from Tesseract into a structured
dictionary matching the IScannedItem TypeScript interface.

Parsing strategy:
  1. Item type detection (first 5 lines, greedy longest-match)
  2. Item Power extraction (regex)
  3. Rarity detection (Unique, Legendary, Rare, Mythic)
  4. Section splitting (separator lines delineate regions)
  5. Affix extraction (additive +, multiplicative x, flat)
  6. Aspect detection (bottom section)
"""

import re
from typing import Optional


# ============================================================
# Known item types (sorted longest-first for greedy matching)
# ============================================================

ITEM_TYPES = sorted([
    # Armor
    "Chest Armor", "Helm", "Gloves", "Pants", "Boots",
    # Jewelry
    "Amulet", "Ring",
    # Weapons
    "2H Sword", "2H Mace", "2H Axe", "2H Polearm", "2H Scythe",
    "2H Staff", "2H Bow", "2H Crossbow",
    "1H Sword", "1H Mace", "1H Axe", "1H Dagger", "1H Wand",
    "Sword", "Mace", "Axe", "Dagger", "Wand",
    "Polearm", "Scythe", "Staff", "Bow", "Crossbow",
    # Offhands
    "Focus", "Shield", "Totem",
], key=lambda x: -len(x))

SLOT_MAP = {
    "Helm": "Helm",
    "Chest Armor": "Chest Armor",
    "Gloves": "Gloves",
    "Pants": "Pants",
    "Boots": "Boots",
    "Amulet": "Amulet",
    "Ring": "Ring",
    "Focus": "Offhand",
    "Shield": "Offhand",
    "Totem": "Offhand",
}

RARITY_KEYWORDS = {
    "mythic": "Mythic",
    "unique": "Unique",
    "legendary": "Legendary",
    "rare": "Rare",
}

# ============================================================
# Regex patterns
# ============================================================

# Item Power: "800 Item Power" or "iP 800" or "Power 800"
ITEM_POWER_RE = re.compile(
    r'(\d{3,4})\s*(?:Item\s*Power|iP|Power)',
    re.IGNORECASE
)

# Additive affix: "+15.5% Damage to Close Enemies"
ADDITIVE_RE = re.compile(
    r'\+\s*([\d,.]+)%?\s+(.+)',
)

# Multiplicative affix: "x10% Vulnerable Damage" or "×10%"
MULTIPLICATIVE_RE = re.compile(
    r'[x×]\s*([\d,.]+)%?\s+(.+)',
    re.IGNORECASE
)

# Flat affix: "+1,250 Maximum Life"
FLAT_RE = re.compile(
    r'\+\s*([\d,]+)\s+(.+)',
)

# Separator lines (series of dashes, underscores, or unicode box chars)
SEPARATOR_RE = re.compile(
    r'^[\s]*[─━\-_]{3,}[\s]*$'
)

# Greater affix indicator
GREATER_INDICATORS = ['⬥', '★', '◆', 'greater']

# Tempered affix indicator
TEMPERED_INDICATORS = ['⚒', '🔨', 'tempered', 'anvil']


# ============================================================
# Parsing functions
# ============================================================

def detect_item_type(lines: list[str]) -> Optional[str]:
    """
    Detect the item type from the first 5 lines of the tooltip.
    Uses greedy longest-match to avoid "Helm" matching before
    "Chest Armor".
    """
    header = ' '.join(lines[:5]).lower()

    for item_type in ITEM_TYPES:
        if item_type.lower() in header:
            return item_type

    return None


def detect_rarity(lines: list[str]) -> str:
    """
    Detect item rarity from the tooltip text.
    Checks the first 5 lines for rarity keywords.
    """
    header = ' '.join(lines[:5]).lower()

    for keyword, rarity in RARITY_KEYWORDS.items():
        if keyword in header:
            return rarity

    return "Rare"  # Default


def extract_item_power(text: str) -> int:
    """Extract the Item Power value from the tooltip text."""
    match = ITEM_POWER_RE.search(text)
    if match:
        return int(match.group(1))
    return 0


def extract_item_name(lines: list[str], item_type: Optional[str]) -> str:
    """
    Extract the item name from the tooltip header.
    Usually the first 1-2 lines before the item type line.
    """
    if not lines:
        return "Unknown Item"

    # The item name is typically line 0 or 1
    name_candidates = []
    for i, line in enumerate(lines[:4]):
        stripped = line.strip()
        if not stripped:
            continue
        # Skip lines that are just the item type
        if item_type and item_type.lower() in stripped.lower():
            continue
        # Skip item power lines
        if ITEM_POWER_RE.search(stripped):
            continue
        # Skip rarity lines that are just the rarity word
        if stripped.lower() in RARITY_KEYWORDS:
            continue
        name_candidates.append(stripped)

    return name_candidates[0] if name_candidates else "Unknown Item"


def split_sections(lines: list[str]) -> dict:
    """
    Split tooltip lines into sections based on separator lines.

    Returns a dict with:
      header: lines before the first separator
      sections: list of line groups between separators
      footer: lines after the last separator (often the aspect)
    """
    sections = []
    current = []

    for line in lines:
        if SEPARATOR_RE.match(line):
            if current:
                sections.append(current)
                current = []
        else:
            current.append(line)

    if current:
        sections.append(current)

    if len(sections) == 0:
        return {"header": lines, "sections": [], "footer": []}

    return {
        "header": sections[0] if sections else [],
        "sections": sections[1:-1] if len(sections) > 2 else [],
        "footer": sections[-1] if len(sections) > 1 else [],
    }


def parse_affix(line: str) -> Optional[dict]:
    """
    Parse a single line into an affix dict.

    Returns:
        {name, value, valueType, isGreater} or None
    """
    stripped = line.strip()
    if not stripped or len(stripped) < 3:
        return None

    # Check for greater affix indicator
    is_greater = any(ind in stripped.lower() for ind in GREATER_INDICATORS)

    # Check for tempered affix indicator
    is_tempered = any(ind in stripped.lower() for ind in TEMPERED_INDICATORS)

    # Try multiplicative match first (x10%)
    match = MULTIPLICATIVE_RE.match(stripped)
    if match:
        value_str = match.group(1).replace(',', '')
        return {
            "name": match.group(2).strip(),
            "value": float(value_str),
            "valueType": "x",
            "isGreater": is_greater,
            "isTempered": is_tempered,
        }

    # Try additive match (+15.5%)
    match = ADDITIVE_RE.match(stripped)
    if match:
        value_str = match.group(1).replace(',', '')
        has_percent = '%' in stripped[:stripped.index(match.group(2))]
        return {
            "name": match.group(2).strip(),
            "value": float(value_str),
            "valueType": "+" if has_percent else "flat",
            "isGreater": is_greater,
            "isTempered": is_tempered,
        }

    # Try flat match (+1,250)
    match = FLAT_RE.match(stripped)
    if match:
        value_str = match.group(1).replace(',', '')
        return {
            "name": match.group(2).strip(),
            "value": float(value_str),
            "valueType": "flat",
            "isGreater": is_greater,
            "isTempered": is_tempered,
        }

    return None


def detect_aspect(footer_lines: list[str]) -> Optional[dict]:
    """
    Detect an aspect from the footer section of the tooltip.
    Aspects are typically in the bottom section after a separator.
    """
    if not footer_lines:
        return None

    # Combine footer lines
    text = ' '.join(l.strip() for l in footer_lines if l.strip())

    if not text or len(text) < 10:
        return None

    # Aspects typically contain descriptive text (not just affix values)
    # Look for lines that don't match affix patterns
    non_affix_lines = []
    for line in footer_lines:
        stripped = line.strip()
        if not stripped:
            continue
        affix = parse_affix(stripped)
        if not affix:
            non_affix_lines.append(stripped)

    if non_affix_lines:
        # First non-affix line is typically the aspect name
        aspect_name = non_affix_lines[0]
        aspect_desc = ' '.join(non_affix_lines[1:]) if len(non_affix_lines) > 1 else None

        return {
            "name": aspect_name,
            "description": aspect_desc,
        }

    return None


def parse_tooltip_text(raw_text: str) -> dict:
    """
    Main parsing function. Converts raw OCR text into a structured
    dictionary compatible with the IScannedItem TypeScript interface.

    Args:
        raw_text: Raw text from Tesseract OCR

    Returns:
        Dict with keys matching IScannedItem
    """
    lines = [l for l in raw_text.split('\n')]
    non_empty = [l for l in lines if l.strip()]

    if not non_empty:
        return {
            "slot": "Unknown",
            "itemName": "Unreadable Item",
            "itemType": "Rare",
            "itemPower": 0,
            "aspect": None,
            "affixes": [],
            "implicitAffixes": [],
            "temperedAffixes": [],
            "greaterAffixes": [],
            "socketedGems": [],
            "rawOcrText": raw_text,
        }

    # 1. Detect item type
    item_type_str = detect_item_type(non_empty)

    # 2. Map to gear slot
    slot = "Unknown"
    if item_type_str:
        slot = SLOT_MAP.get(item_type_str, item_type_str)

    # 3. Detect rarity
    rarity = detect_rarity(non_empty)

    # 4. Extract item power
    item_power = extract_item_power(raw_text)

    # 5. Extract item name
    item_name = extract_item_name(non_empty, item_type_str)

    # 6. Split into sections
    parts = split_sections(non_empty)

    # 7. Parse affixes from middle sections
    regular_affixes = []
    implicit_affixes = []
    tempered_affixes = []
    greater_affixes = []
    socketed_gems = []

    # First section after header is often implicits
    all_middle_lines = []
    for section in parts.get("sections", []):
        all_middle_lines.extend(section)

    for line in all_middle_lines:
        stripped = line.strip()

        # Check for socketed gems
        if any(gem in stripped.lower() for gem in
               ['ruby', 'sapphire', 'emerald', 'diamond',
                'topaz', 'amethyst', 'skull', 'gem']):
            socketed_gems.append(stripped)
            continue

        affix = parse_affix(stripped)
        if affix:
            if affix.get("isTempered"):
                tempered_affixes.append({
                    "name": affix["name"],
                    "value": affix["value"],
                    "valueType": affix["valueType"],
                    "isGreater": False,
                })
            elif affix.get("isGreater"):
                greater_affixes.append({
                    "name": affix["name"],
                    "value": affix["value"],
                    "valueType": affix["valueType"],
                    "isGreater": True,
                })
            else:
                regular_affixes.append({
                    "name": affix["name"],
                    "value": affix["value"],
                    "valueType": affix["valueType"],
                    "isGreater": False,
                })

    # 8. Parse implicits from header section (after basics)
    for line in parts.get("header", [])[3:]:  # Skip name/type/power lines
        affix = parse_affix(line.strip())
        if affix:
            implicit_affixes.append({
                "name": affix["name"],
                "value": affix["value"],
                "valueType": affix["valueType"],
                "isGreater": False,
            })

    # 9. Detect aspect from footer
    aspect = detect_aspect(parts.get("footer", []))

    return {
        "slot": slot,
        "itemName": item_name,
        "itemType": rarity,
        "itemPower": item_power,
        "aspect": aspect,
        "affixes": regular_affixes,
        "implicitAffixes": implicit_affixes,
        "temperedAffixes": tempered_affixes,
        "greaterAffixes": greater_affixes,
        "socketedGems": socketed_gems,
        "rawOcrText": raw_text,
    }
