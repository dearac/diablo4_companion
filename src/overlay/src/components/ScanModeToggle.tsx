interface ScanModeToggleProps {
    /** Whether equip mode is currently active */
    isEquipMode: boolean
    /** Callback when the mode is toggled */
    onToggle: (equip: boolean) => void
}

/**
 * ScanModeToggle — Toggle between Equip Mode and Inventory Mode.
 *
 * Equip Mode (checked):
 *   Scanned items are saved as equipped gear in the build profile.
 *
 * Inventory Mode (unchecked, default):
 *   Scanned items are compared against equipped gear + build requirements.
 */
function ScanModeToggle({ isEquipMode, onToggle }: ScanModeToggleProps): React.JSX.Element {
    return (
        <div className="scan-mode-toggle">
            <label className="scan-mode-toggle__label">
                <input
                    type="checkbox"
                    className="scan-mode-toggle__checkbox"
                    checked={isEquipMode}
                    onChange={e => onToggle(e.target.checked)}
                />
                <span className="scan-mode-toggle__switch" />
                <span className="scan-mode-toggle__text">
                    {isEquipMode ? '🛡️ Equip Mode' : '📦 Inventory Mode'}
                </span>
            </label>
        </div>
    )
}

export default ScanModeToggle
