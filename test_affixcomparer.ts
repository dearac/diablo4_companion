import { compareAffixes } from './src/shared/AffixComparer'

console.log('Passive test:', compareAffixes('+3 to The Best Offense', 'The Best Offense'))
console.log('Implicit test:', compareAffixes('+204 All Resist', 'All Resistances'))
