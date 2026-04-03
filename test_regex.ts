import { parseTooltip } from './src/main/services/GearParser'

const lines = ['+3 to The Best Offense Casting an Ultimate Skill increases']
console.log(parseTooltip(lines).affixes)
