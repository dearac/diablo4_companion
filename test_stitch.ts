import { parseTooltip } from './src/main/services/GearParser'

const lines = [
  '+3 to The Best Offense',
  'Casting an Ultimate Skill increases',
  'your Ultimate damage by 13.8%, up'
]
const result = parseTooltip(lines)
console.log('Parsed Affixes:', result.affixes)
