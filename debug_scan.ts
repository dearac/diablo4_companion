import { join } from 'path'
import { runOcr } from './src/main/services/OcrService'
import { isolateTooltip } from './src/main/services/OcrFilter'

async function debugScan() {
  const imagePath = join(process.cwd(), 'data', 'scans', 'scan-1775163800967.jpg')
  const sidecarDir = join(process.cwd(), 'sidecar', 'bin')

  console.log(`Analyzing: ${imagePath}`)

  const rawOcrResult = await runOcr(imagePath, sidecarDir)

  console.log('\n--- RAW OCR ---')
  rawOcrResult.lines.forEach((l) => {
    // bounding box: minX, minY, maxX, maxY
    const xs = l.words.map((w) => w.bbox.x)
    const ys = l.words.map((w) => w.bbox.y)
    const maxX = Math.max(...l.words.map((w) => w.bbox.x + w.bbox.w))
    const maxY = Math.max(...l.words.map((w) => w.bbox.y + w.bbox.h))
    console.log(`[${Math.min(...xs)}, ${Math.min(...ys)} -> ${maxX}, ${maxY}] "${l.text}"`)
  })

  const filtered = isolateTooltip(rawOcrResult)

  console.log('\n--- FILTERED ---')
  filtered.lines.forEach((l, i) => {
    console.log(`[${i}] "${l.text}"`)
  })
}

debugScan().catch(console.error)
