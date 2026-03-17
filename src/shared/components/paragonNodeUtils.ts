import type { IParagonNode } from '../types'

/**
 * NODE_TYPE_CONFIG — Maps internal node type keys to display labels,
 * accent colors, and icons for the tooltip header.
 */
export const NODE_TYPE_CONFIG: Record<
  IParagonNode['nodeType'],
  { label: string; color: string; icon: string }
> = {
  normal: { label: 'Normal Node', color: '#999999', icon: '◇' },
  magic: { label: 'Magic Node', color: '#6888ff', icon: '◆' },
  rare: { label: 'Rare Node', color: '#ffd700', icon: '★' },
  legendary: { label: 'Legendary Node', color: '#ff8c00', icon: '⬡' },
  gate: { label: 'Gate Node', color: '#00cc88', icon: '⬡' }
}

/**
 * NAME_MAP — Translates d4builds.gg stat abbreviation alt-text
 * into human-readable names for display.
 */
const NAME_MAP: Record<string, string> = {
  Int: 'Intelligence',
  Str: 'Strength',
  Dex: 'Dexterity',
  Will: 'Willpower',
  DamageToElite: 'Damage to Elites',
  DamagePhysical: 'Physical Damage',
  DamageReduction: 'Damage Reduction',
  DamageReductionWhileFortified: 'DR While Fortified',
  DamageReductionWhileInjured: 'DR While Injured',
  DamageReductionFromCloseEnemies: 'DR from Close Enemies',
  DamageReductionFromDistantEnemies: 'DR from Distant Enemies',
  MaxLife: 'Maximum Life',
  Armor: 'Armor',
  CritChance: 'Critical Strike Chance',
  CritDamage: 'Critical Strike Damage',
  OverpowerDamage: 'Overpower Damage',
  HealingReceived: 'Healing Received',
  AttackSpeed: 'Attack Speed',
  CooldownReduction: 'Cooldown Reduction',
  ResourceGeneration: 'Resource Generation',
  ResistAll: 'All Resistances',
  ResistFire: 'Fire Resistance',
  ResistCold: 'Cold Resistance',
  ResistLightning: 'Lightning Resistance',
  ResistPoison: 'Poison Resistance',
  ResistShadow: 'Shadow Resistance',
  ThornsPhysical: 'Physical Thorns',
  Gate: 'Gate',
  GlyphRange: 'Glyph Range',
  VulnerableDamage: 'Vulnerable Damage',
  NonPhysicalDamage: 'Non-Physical Damage',
  DamageOverTime: 'Damage Over Time',
  UltimateDamage: 'Ultimate Damage',
  CoreDamage: 'Core Skill Damage',
  CompanionDamage: 'Companion Damage',
  BerserkDamage: 'Berserk Damage',
  MoveSpeedEliteKill: 'Move Speed on Elite Kill',
  HPPercent: 'Maximum Life %',
  DamageWhileFortified: 'Damage While Fortified',
  DamageWhileHealthy: 'Damage While Healthy',
  LuckyHitChance: 'Lucky Hit Chance',
  TotalArmor: 'Total Armor',
  BasicAttackSpeed: 'Basic Attack Speed',
  MovementSpeed: 'Movement Speed',
  DodgeChance: 'Dodge Chance',
  PhysicalDamage: 'Physical Damage',
  FireDamage: 'Fire Damage',
  ColdDamage: 'Cold Damage',
  LightningDamage: 'Lightning Damage',
  PoisonDamage: 'Poison Damage',
  ShadowDamage: 'Shadow Damage'
}

/**
 * Formats a raw node name from a d4builds PascalCase abbreviation
 * into a human-readable display name.
 */
export function formatNodeName(raw: string): string {
  if (NAME_MAP[raw]) return NAME_MAP[raw]
  return raw.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
}

/**
 * Gets the accent color for a node type.
 */
export function getNodeTypeColor(nodeType: IParagonNode['nodeType']): string {
  return NODE_TYPE_CONFIG[nodeType]?.color || '#999'
}
