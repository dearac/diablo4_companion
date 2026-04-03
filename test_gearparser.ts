import { join } from 'path'
import { runOcr } from './src/main/services/OcrService'
import { isolateTooltip } from './src/main/services/OcrFilter'
import { parseTooltip } from './src/main/services/GearParser'

async function debugScan() {
  const imagePath = join(process.cwd(), 'data', 'scans', 'scan-1775163800967.jpg')
  const sidecarDir = join(process.cwd(), 'sidecar', 'bin')

  const rawOcrResult = await runOcr(imagePath, sidecarDir)
  const filtered = isolateTooltip(rawOcrResult)
  const parsed = parseTooltip(filtered.lines.map((l) => l.text))

  console.log('\n--- PARSED AFFIXES ---')
  parsed.affixes.forEach((a) => console.log(a))
}

debugScan().catch(console.error)
