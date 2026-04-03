const fs = require('fs')
const path = require('path')

const dir = path.join(__dirname, 'data', 'scans', 'recordings')
const folders = fs.readdirSync(dir)

console.log('--- SCAN ANALYSIS ---')

folders.forEach((fd) => {
  const jsonPath = path.join(dir, fd, 'recording.json')
  if (!fs.existsSync(jsonPath)) return

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
  const parsed = data.parsedItem

  const hasIssue = parsed.slot === 'Unknown' || parsed.affixes.some((a) => a.includes('Armor ('))

  if (hasIssue || true) {
    // just print all for a minute
    console.log(`\nID: ${fd}`)
    console.log(`Name: ${parsed.itemName}`)
    console.log(`Slot: ${parsed.slot}`)
    console.log(`Type: ${parsed.itemType}`)
    console.log(`Power: ${parsed.itemPower}`)
    console.log(`Affixes (${parsed.affixes.length}):`)
    parsed.affixes.forEach((a) => console.log(`  - ${a}`))

    console.log(`OCR Lines:`)
    data.ocrLines.forEach((l, i) => console.log(`  [${i}] ${l}`))
  }
})
