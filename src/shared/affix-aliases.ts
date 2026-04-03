/**
 * affix-aliases.ts — Maps known affix name variations to canonical stat names.
 *
 * Keys: lowercased alias strings (OCR variations, abbreviations, d4builds format)
 * Values: canonical stat names (the "true" name of each stat)
 *
 * This is the single source of truth for affix identity resolution.
 */

export const AFFIX_ALIASES: Record<string, string> = {
  // ── Primary Stats ──
  strength: 'Strength',
  str: 'Strength',
  intelligence: 'Intelligence',
  int: 'Intelligence',
  willpower: 'Willpower',
  will: 'Willpower',
  dexterity: 'Dexterity',
  dex: 'Dexterity',
  'all stats': 'All Stats',
  allstats: 'All Stats', // OCR merges words

  // ── Offensive ──
  'critical strike chance': 'Critical Strike Chance',
  'crit chance': 'Critical Strike Chance',
  'crit strike chance': 'Critical Strike Chance',
  'critical strike damage': 'Critical Strike Damage',
  'crit damage': 'Critical Strike Damage',
  'crit strike damage': 'Critical Strike Damage',
  'attack speed': 'Attack Speed',
  'basic attack speed': 'Basic Attack Speed',
  'vulnerable damage': 'Vulnerable Damage',
  'overpower damage': 'Overpower Damage',

  // ── Defensive ──
  'maximum life': 'Maximum Life',
  'max life': 'Maximum Life',
  life: 'Maximum Life',
  armor: 'Armor',
  'total armor': 'Total Armor',
  'damage reduction': 'Damage Reduction',
  'damage reduction from close enemies': 'Damage Reduction from Close Enemies',
  'damage reduction from distant enemies': 'Damage Reduction from Distant Enemies',
  'dodge chance': 'Dodge Chance',

  // ── Resource ──
  'cooldown reduction': 'Cooldown Reduction',
  cdr: 'Cooldown Reduction',
  'resource generation': 'Resource Generation',
  'resource cost reduction': 'Resource Cost Reduction',
  'lucky hit chance': 'Lucky Hit Chance',
  'lucky hit: chance': 'Lucky Hit Chance', // OCR sometimes catches the colon
  'lucky hit': 'Lucky Hit Chance',

  // ── Resistance ──
  'fire resistance': 'Fire Resistance',
  'cold resistance': 'Cold Resistance',
  'lightning resistance': 'Lightning Resistance',
  'poison resistance': 'Poison Resistance',
  'shadow resistance': 'Shadow Resistance',
  'all resistances': 'All Resistances',
  'all resist': 'All Resistances',
  'resist all elements': 'All Resistances',
  'resistance to all elements': 'All Resistances',

  // ── Damage Types ──
  'damage to elites': 'Damage to Elites',
  'damage to close enemies': 'Damage to Close Enemies',
  'damage to distant enemies': 'Damage to Distant Enemies',
  'damage to crowd controlled enemies': 'Damage to Crowd Controlled Enemies',
  'damage to cc': 'Damage to Crowd Controlled Enemies',
  "damage to cc'd enemies": 'Damage to Crowd Controlled Enemies',
  'damage to slowed enemies': 'Damage to Slowed Enemies',
  'damage to stunned enemies': 'Damage to Stunned Enemies',
  'damage to injured enemies': 'Damage to Injured Enemies',
  'damage to healthy enemies': 'Damage to Healthy Enemies',

  // ── Misc ──
  thorns: 'Thorns',
  'life on kill': 'Life on Kill',
  'lifeonkill': 'Life on Kill',
  'lifeonki11': 'Life on Kill',
  'life per hit': 'Life per Hit',
  'life on hit': 'Life per Hit',
  'lifeonhit': 'Life per Hit',
  'movement speed': 'Movement Speed',
  'move speed': 'Movement Speed',
  'healing received': 'Healing Received',
  'barrier generation': 'Barrier Generation',
  'crowd control duration': 'Crowd Control Duration',
  'cc duration': 'Crowd Control Duration',

  // ── Tempered / Specialized ──
  'chance to deal double damage': 'Chance to Deal Double Damage',
  'ranks to all skills': 'Ranks to All Skills',
  'ranks of all skills': 'Ranks to All Skills'
}

/**
 * All known canonical affix names.
 * Derived from the values of AFFIX_ALIASES (deduplicated).
 */
export const CANONICAL_AFFIX_NAMES: string[] = [...new Set(Object.values(AFFIX_ALIASES))]
