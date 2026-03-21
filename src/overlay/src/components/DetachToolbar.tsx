/**
 * DetachToolbar — Compact control bar for the detach overlay.
 *
 * When unlocked: shows full controls (opacity slider, rotation, lock, done).
 * When locked: collapses to a small floating pill with just Done + Unlock.
 */

interface DetachToolbarProps {
    opacity: number
    rotation: number
    locked: boolean
    onOpacityChange: (value: number) => void
    onRotateCW: () => void
    onRotateCCW: () => void
    onRotateFineCW: () => void
    onRotateFineCCW: () => void
    onLock: () => void
    onUnlock: () => void
    onDone: () => void
    onPillEnter: () => void
    onPillLeave: () => void
}

function DetachToolbar({
    opacity,
    rotation,
    locked,
    onOpacityChange,
    onRotateCW,
    onRotateCCW,
    onRotateFineCW,
    onRotateFineCCW,
    onLock,
    onUnlock,
    onDone,
    onPillEnter,
    onPillLeave
}: DetachToolbarProps): React.JSX.Element {
    if (locked) {
        // Collapsed pill — just Done + Unlock, stays interactive
        return (
            <div
                className="detach-toolbar detach-toolbar--locked"
                onMouseEnter={onPillEnter}
                onMouseLeave={onPillLeave}
            >
                <button
                    className="detach-toolbar__btn detach-toolbar__btn--unlock"
                    onClick={onUnlock}
                    title="Unlock — resume adjusting"
                >
                    🔓
                </button>
                <button
                    className="detach-toolbar__btn detach-toolbar__btn--done"
                    onClick={onDone}
                    title="Close detach overlay"
                >
                    ✕
                </button>
            </div>
        )
    }

    return (
        <div className="detach-toolbar detach-toolbar--full">
            {/* Opacity slider */}
            <div className="detach-toolbar__group">
                <label className="detach-toolbar__label">Opacity</label>
                <input
                    type="range"
                    min={10}
                    max={100}
                    value={opacity}
                    onChange={(e) => onOpacityChange(Number(e.target.value))}
                    className="detach-toolbar__slider"
                />
                <span className="detach-toolbar__value">{opacity}%</span>
            </div>

            {/* Rotation controls */}
            <div className="detach-toolbar__group">
                <label className="detach-toolbar__label">Rotate</label>
                <button className="detach-toolbar__btn" onClick={onRotateFineCCW} title="Rotate -5°">
                    ↺5
                </button>
                <button className="detach-toolbar__btn" onClick={onRotateCCW} title="Rotate -90°">
                    ⟲
                </button>
                <span className="detach-toolbar__value">{rotation}°</span>
                <button className="detach-toolbar__btn" onClick={onRotateCW} title="Rotate +90°">
                    ⟳
                </button>
                <button className="detach-toolbar__btn" onClick={onRotateFineCW} title="Rotate +5°">
                    5↻
                </button>
            </div>

            {/* Lock + Done */}
            <div className="detach-toolbar__group">
                <button
                    className="detach-toolbar__btn detach-toolbar__btn--lock"
                    onClick={onLock}
                    title="Lock position — makes overlay click-through"
                >
                    🔒 Lock
                </button>
                <button
                    className="detach-toolbar__btn detach-toolbar__btn--done"
                    onClick={onDone}
                    title="Close detach overlay"
                >
                    ✕ Done
                </button>
            </div>
        </div>
    )
}

export default DetachToolbar
