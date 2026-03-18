import type { IGearSlot, IGearVerdict, IInventoryVerdict, IEquippedGear } from '../../../shared/types'

// ============================================================
// Types
// ============================================================

interface GearVerdictPanelProps {
    /** Build-required gear slots for reference */
    buildSlots: IGearSlot[]
    /** Equipped gear verdicts (Mode 1) */
    buildVerdicts: IGearVerdict[]
    /** The user's equipped gear state */
    equippedGear: IEquippedGear | null
    /** Latest inventory item verdict (Mode 2) */
    inventoryVerdict: IInventoryVerdict | null
    /** Whether equip mode is active */
    isEquipMode: boolean
}

// ============================================================
// GearVerdictPanel Component
// ============================================================

/**
 * GearVerdictPanel — Full gear comparison display.
 *
 * Equip Mode view:
 *   Grid showing all gear slots with match status (✅/❌/⚠️)
 *   Each slot expandable to show build requirements vs equipped
 *
 * Inventory Mode view:
 *   Side-by-side comparison of equipped vs scanned drop
 *   Highlighted gains (green) and losses (red)
 *   Recommendation badge
 */
function GearVerdictPanel({
    buildSlots,
    buildVerdicts,
    equippedGear,
    inventoryVerdict,
    isEquipMode
}: GearVerdictPanelProps): React.JSX.Element {

    if (isEquipMode) {
        return renderEquipModeView(buildVerdicts, buildSlots, equippedGear)
    }

    return renderInventoryModeView(inventoryVerdict, equippedGear)
}

// ============================================================
// Equip Mode — "What am I missing from the build?"
// ============================================================

function renderEquipModeView(
    verdicts: IGearVerdict[],
    buildSlots: IGearSlot[],
    equippedGear: IEquippedGear | null
): React.JSX.Element {
    if (verdicts.length === 0) {
        return (
            <div className="gear-verdict">
                <div className="gear-verdict__empty">
                    <p>No gear scanned yet.</p>
                    <p className="gear-verdict__hint">
                        Enable <strong>Equip Mode</strong> and press your scan hotkey
                        while hovering over each equipped item in-game.
                    </p>
                </div>
            </div>
        )
    }

    const perfectCount = verdicts.filter(v => v.overallRating === 'PERFECT').length
    const totalSlots = verdicts.length

    return (
        <div className="gear-verdict">
            {/* Summary bar */}
            <div className="gear-verdict__summary">
                <span className="gear-verdict__score">
                    {perfectCount}/{totalSlots} Perfect
                </span>
                <div className="gear-verdict__progress">
                    <div
                        className="gear-verdict__progress-bar"
                        style={{ width: `${(perfectCount / totalSlots) * 100}%` }}
                    />
                </div>
            </div>

            {/* Slot grid */}
            <div className="gear-verdict__grid">
                {verdicts.map(verdict => {
                    const ratingIcon = verdict.overallRating === 'PERFECT' ? '✅' :
                        verdict.overallRating === 'GOOD' ? '🟢' :
                            verdict.overallRating === 'CLOSE' ? '⚠️' : '❌'

                    const equipped = equippedGear?.slots[verdict.slot]
                    const buildSlot = buildSlots.find(s => s.slot === verdict.slot)
                    const missingDetails = verdict.details.filter(d => !d.matched)

                    return (
                        <div
                            key={verdict.slot}
                            className={`gear-verdict__slot gear-verdict__slot--${verdict.overallRating.toLowerCase()}`}
                        >
                            <div className="gear-verdict__slot-header">
                                <span className="gear-verdict__slot-icon">{ratingIcon}</span>
                                <span className="gear-verdict__slot-name">{verdict.slot}</span>
                                <span className="gear-verdict__slot-score">{verdict.overallScore}%</span>
                            </div>

                            {equipped && (
                                <div className="gear-verdict__equipped">
                                    <span className="gear-verdict__item-name">{equipped.itemName}</span>
                                    <span className={`gear-verdict__item-rarity gear-verdict__item-rarity--${equipped.itemType.toLowerCase()}`}>
                                        {equipped.itemType}
                                    </span>
                                </div>
                            )}

                            {missingDetails.length > 0 && (
                                <div className="gear-verdict__missing">
                                    <div className="gear-verdict__missing-label">Missing:</div>
                                    <ul className="gear-verdict__missing-list">
                                        {missingDetails.map((detail, i) => (
                                            <li key={i} className="gear-verdict__missing-item">
                                                <span className="gear-verdict__missing-category">
                                                    {detail.category}:
                                                </span>
                                                {detail.advice || detail.expected}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {buildSlot?.requiredAspect && (
                                <div className="gear-verdict__aspect-req">
                                    Needs: {buildSlot.requiredAspect.name}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// ============================================================
// Inventory Mode — "Should I equip this drop?"
// ============================================================

function renderInventoryModeView(
    verdict: IInventoryVerdict | null,
    equippedGear: IEquippedGear | null
): React.JSX.Element {
    if (!verdict) {
        return (
            <div className="gear-verdict">
                <div className="gear-verdict__empty">
                    <p>No item scanned yet.</p>
                    <p className="gear-verdict__hint">
                        Press your scan hotkey while hovering over an inventory item
                        to compare it against your equipped gear and build.
                    </p>
                </div>
            </div>
        )
    }

    const equipped = equippedGear?.slots[verdict.comparedToSlot]
    const recClass = verdict.recommendation.toLowerCase()

    return (
        <div className="gear-verdict">
            {/* Recommendation badge */}
            <div className={`gear-verdict__recommendation gear-verdict__recommendation--${recClass}`}>
                <span className="gear-verdict__rec-icon">
                    {verdict.recommendation === 'EQUIP' ? '⬆️' :
                        verdict.recommendation === 'SALVAGE' ? '🔨' :
                            verdict.recommendation === 'KEEP_FOR_TEMPER' ? '⚒️' : '↔️'}
                </span>
                <span className="gear-verdict__rec-text">{verdict.recommendation}</span>
                <span className="gear-verdict__rec-score">
                    {verdict.upgradeScore > 0 ? '+' : ''}{verdict.upgradeScore}
                </span>
            </div>

            {/* Side-by-side comparison */}
            <div className="gear-verdict__comparison">
                {/* Current equipped */}
                <div className="gear-verdict__compare-col">
                    <div className="gear-verdict__compare-header">Equipped</div>
                    {equipped ? (
                        <>
                            <div className="gear-verdict__compare-name">{equipped.itemName}</div>
                            <div className={`gear-verdict__compare-rarity gear-verdict__compare-rarity--${equipped.itemType.toLowerCase()}`}>
                                {equipped.itemType} • iP {equipped.itemPower}
                            </div>
                        </>
                    ) : (
                        <div className="gear-verdict__compare-empty">Empty slot</div>
                    )}
                </div>

                <div className="gear-verdict__compare-arrow">→</div>

                {/* Scanned drop */}
                <div className="gear-verdict__compare-col">
                    <div className="gear-verdict__compare-header">This Drop</div>
                    <div className="gear-verdict__compare-name">
                        {verdict.scannedItem.itemName}
                    </div>
                    <div className={`gear-verdict__compare-rarity gear-verdict__compare-rarity--${verdict.scannedItem.itemType.toLowerCase()}`}>
                        {verdict.scannedItem.itemType} • iP {verdict.scannedItem.itemPower}
                    </div>
                </div>
            </div>

            {/* Gains */}
            {verdict.gainsOverEquipped.length > 0 && (
                <div className="gear-verdict__delta gear-verdict__delta--gains">
                    <div className="gear-verdict__delta-label">✅ Gains</div>
                    <ul className="gear-verdict__delta-list">
                        {verdict.gainsOverEquipped.map((gain, i) => (
                            <li key={i} className="gear-verdict__delta-item">{gain}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Losses */}
            {verdict.lossesFromEquipped.length > 0 && (
                <div className="gear-verdict__delta gear-verdict__delta--losses">
                    <div className="gear-verdict__delta-label">❌ Losses</div>
                    <ul className="gear-verdict__delta-list">
                        {verdict.lossesFromEquipped.map((loss, i) => (
                            <li key={i} className="gear-verdict__delta-item">{loss}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Still missing from build */}
            {verdict.stillMissingFromBuild.length > 0 && (
                <div className="gear-verdict__delta gear-verdict__delta--missing">
                    <div className="gear-verdict__delta-label">⚠️ Still Missing from Build</div>
                    <ul className="gear-verdict__delta-list">
                        {verdict.stillMissingFromBuild.map((missing, i) => (
                            <li key={i} className="gear-verdict__delta-item">{missing}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )
}

export default GearVerdictPanel
