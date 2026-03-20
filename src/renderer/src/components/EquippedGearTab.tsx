import { useState, useEffect } from 'react'
import type { ScannedGearPiece, RawBuildData, IGearSlot } from '../../../shared/types'

interface EquippedGearTabProps {
  buildData: RawBuildData | null
}

/** Slot display order */
const SLOT_ORDER = [
  'Helm',
  'Chest Armor',
  'Gloves',
  'Pants',
  'Boots',
  'Amulet',
  'Ring 1',
  'Ring 2',
  'Weapon',
  'Offhand'
]

/**
 * Checks if a scanned affix matches a build-expected affix name.
 */
function affixMatches(scannedAffix: string, buildAffixName: string): boolean {
  const scan = scannedAffix.toLowerCase()
  const build = buildAffixName.toLowerCase()
  return scan.includes(build) || build.includes(scan)
}

/**
 * EquippedGearTab — Main app tab showing all equipped gear with build comparison.
 *
 * Fetches equipped gear on mount. Compares each slot to the loaded build.
 * Shows ✅/❌ for matched/missing affixes, aspect match status,
 * and improvement suggestions.
 */
function EquippedGearTab({ buildData }: EquippedGearTabProps): React.JSX.Element {
  const [equippedGear, setEquippedGear] = useState<Record<string, ScannedGearPiece>>({})
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    window.api
      .getEquippedGear()
      .then((gear) => {
        setEquippedGear(gear)
        setIsLoading(false)
      })
      .catch(() => setIsLoading(false))
  }, [])

  if (isLoading) {
    return <div className="main-tab-panel main-tab-panel--loading">Loading equipped gear...</div>
  }

  const slotNames = SLOT_ORDER.filter(
    (s) => equippedGear[s] || buildData?.gearSlots.some((gs) => gs.slot === s)
  )

  if (slotNames.length === 0) {
    return (
      <div className="main-tab-panel main-tab-panel--empty">
        <span className="main-tab-panel__empty-icon">🛡️</span>
        <span>No equipped gear scanned yet</span>
        <span className="main-tab-panel__empty-hint">
          Switch to Equip mode (F8) and scan each gear slot (F7)
        </span>
      </div>
    )
  }

  return (
    <div className="main-tab-panel">
      <div className="main-tab-panel__header">
        <span className="main-tab-panel__title">Equipped Gear</span>
      </div>

      <div className="equipped-grid">
        {slotNames.map((slotName) => {
          const equipped = equippedGear[slotName] ?? null
          const buildSlot: IGearSlot | undefined = buildData?.gearSlots.find(
            (gs) => gs.slot === slotName
          )

          // Calculate affix comparison
          let matched: string[] = []
          let missing: string[] = []
          if (equipped && buildSlot) {
            const allBuildAffixes = buildSlot.affixes.map((a) => a.name)
            const allEquippedAffixes = [
              ...equipped.affixes,
              ...equipped.temperedAffixes,
              ...equipped.greaterAffixes
            ]
            for (const buildAffix of allBuildAffixes) {
              const found = allEquippedAffixes.some((ea) => affixMatches(ea, buildAffix))
              if (found) matched.push(buildAffix)
              else missing.push(buildAffix)
            }
          }

          // Aspect comparison
          const expectedAspect = buildSlot?.requiredAspect?.name ?? null
          const equippedAspect = equipped?.aspect?.name ?? null
          let aspectMatch = true
          if (expectedAspect && equippedAspect) {
            aspectMatch =
              equippedAspect.toLowerCase().includes(expectedAspect.toLowerCase()) ||
              expectedAspect.toLowerCase().includes(equippedAspect.toLowerCase())
          } else if (expectedAspect && !equippedAspect) {
            aspectMatch = false
          }

          const total = (matched.length || 0) + (missing.length || 0)
          const matchPercentage = total > 0 ? Math.round((matched.length / total) * 100) : 0

          return (
            <div key={slotName} className="equipped-slot-card">
              <div className="equipped-slot-card__header">
                <span className="equipped-slot-card__slot">{slotName}</span>
                {equipped && total > 0 && (
                  <span
                    className={`equipped-slot-card__pct ${
                      matchPercentage >= 75
                        ? 'equipped-slot-card__pct--high'
                        : matchPercentage >= 50
                          ? 'equipped-slot-card__pct--mid'
                          : 'equipped-slot-card__pct--low'
                    }`}
                  >
                    {matchPercentage}%
                  </span>
                )}
              </div>

              {equipped ? (
                <>
                  <div className="equipped-slot-card__item">
                    {equipped.itemName} ({equipped.itemPower} iP)
                  </div>

                  {matched.length > 0 && (
                    <div className="equipped-slot-card__affixes">
                      {matched.map((a, i) => (
                        <div
                          key={i}
                          className="equipped-slot-card__affix equipped-slot-card__affix--match"
                        >
                          ✅ {a}
                        </div>
                      ))}
                    </div>
                  )}
                  {missing.length > 0 && (
                    <div className="equipped-slot-card__affixes">
                      {missing.map((a, i) => (
                        <div
                          key={i}
                          className="equipped-slot-card__affix equipped-slot-card__affix--miss"
                        >
                          ❌ {a}
                        </div>
                      ))}
                    </div>
                  )}

                  {expectedAspect && (
                    <div
                      className={`equipped-slot-card__aspect ${aspectMatch ? 'equipped-slot-card__aspect--match' : 'equipped-slot-card__aspect--miss'}`}
                    >
                      {aspectMatch ? '✅' : '❌'} {expectedAspect}
                    </div>
                  )}

                  {missing.length > 0 && (
                    <div className="equipped-slot-card__suggestions">
                      <div className="equipped-slot-card__suggestion">
                        🔧 Enchant: Reroll a non-build affix → {missing[0]}
                      </div>
                      {missing.length > 1 && (
                        <div className="equipped-slot-card__suggestion">
                          ⚒️ Temper: Add {missing[1]}
                        </div>
                      )}
                    </div>
                  )}
                  {!aspectMatch && expectedAspect && (
                    <div className="equipped-slot-card__suggestions">
                      <div className="equipped-slot-card__suggestion">
                        🔮 Replace aspect with {expectedAspect}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="equipped-slot-card__empty">Not scanned</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default EquippedGearTab
