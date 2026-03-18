import { useState, useEffect, useRef, useCallback } from 'react'
import HelpTooltip from './HelpTooltip'

/**
 * Hotkey action metadata for display
 */
const HOTKEY_ACTIONS = [
    { key: 'toggle', label: 'Toggle Overlay', description: 'Show/hide the in-game overlay', icon: '👁️' },
    { key: 'scan', label: 'Scan Tooltip', description: 'OCR scan the hovered item tooltip', icon: '📷' },
    { key: 'report', label: 'Gear Report', description: 'Open the gear comparison panel', icon: '📊' }
]

/**
 * Converts a keyboard event into an Electron accelerator string.
 * e.g. Ctrl+Shift+F7, F6, Alt+S
 */
function keyEventToAccelerator(e: KeyboardEvent): string | null {
    // Ignore standalone modifier keys
    const modifierKeys = ['Control', 'Shift', 'Alt', 'Meta']
    if (modifierKeys.includes(e.key)) return null

    const parts: string[] = []
    if (e.ctrlKey) parts.push('Ctrl')
    if (e.altKey) parts.push('Alt')
    if (e.shiftKey) parts.push('Shift')

    // Normalize key name to Electron accelerator format
    let key = e.key
    if (key === ' ') key = 'Space'
    else if (key === 'Escape') key = 'Escape'
    else if (key === 'Delete') key = 'Delete'
    else if (key === 'Backspace') key = 'Backspace'
    else if (key === 'Enter') key = 'Return'
    else if (key === 'ArrowUp') key = 'Up'
    else if (key === 'ArrowDown') key = 'Down'
    else if (key === 'ArrowLeft') key = 'Left'
    else if (key === 'ArrowRight') key = 'Right'
    else if (key.match(/^F\d{1,2}$/)) key = key // F1-F12 are fine
    else if (key.length === 1) key = key.toUpperCase() // Single chars
    else return null // Unknown key

    parts.push(key)
    return parts.join('+')
}

/**
 * HotkeySettings — Interactive global hotkey configuration panel.
 *
 * Each action shows its current keybinding in a styled key badge.
 * Clicking a key badge enters "recording" mode: the next keypress
 * is captured and saved as the new binding.
 *
 * Features:
 *   - Visual key recorder with pulsing animation
 *   - Conflict detection (warns if a key is already used)
 *   - Reset to defaults button
 *   - Persists via HotkeyService in the main process
 */
function HotkeySettings(): React.JSX.Element {
    const [hotkeys, setHotkeys] = useState<Record<string, string>>({})
    const [recording, setRecording] = useState<string | null>(null)
    const [conflict, setConflict] = useState<string | null>(null)
    const [isOpen, setIsOpen] = useState(false)
    const recorderRef = useRef<HTMLDivElement>(null)

    // Load current hotkeys on mount
    useEffect(() => {
        window.api.getHotkeys().then(setHotkeys)
    }, [])

    // Keyboard listener for recording mode
    useEffect(() => {
        if (!recording) return

        const handler = (e: KeyboardEvent): void => {
            e.preventDefault()
            e.stopPropagation()

            const accelerator = keyEventToAccelerator(e)
            if (!accelerator) return

            // Check for conflicts
            const conflictAction = Object.entries(hotkeys).find(
                ([action, key]) => action !== recording && key === accelerator
            )
            if (conflictAction) {
                setConflict(`Already used by "${HOTKEY_ACTIONS.find((a) => a.key === conflictAction[0])?.label || conflictAction[0]}"`)
                setTimeout(() => setConflict(null), 3000)
                return
            }

            // Save the new keybinding
            window.api.setHotkey(recording, accelerator).then((updated) => {
                setHotkeys(updated)
                setRecording(null)
            })
        }

        // ESC cancels recording
        const escHandler = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') {
                e.preventDefault()
                setRecording(null)
            }
        }

        window.addEventListener('keydown', handler, true)
        window.addEventListener('keydown', escHandler, true)
        return () => {
            window.removeEventListener('keydown', handler, true)
            window.removeEventListener('keydown', escHandler, true)
        }
    }, [recording, hotkeys])

    // Click outside to cancel recording
    useEffect(() => {
        if (!recording) return

        const handleClickOutside = (e: MouseEvent): void => {
            if (recorderRef.current && !recorderRef.current.contains(e.target as Node)) {
                setRecording(null)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [recording])

    /** Reset all hotkeys to defaults */
    const handleReset = useCallback(async (): Promise<void> => {
        const defaults = { toggle: 'F6', scan: 'F7', report: 'F8' }
        for (const [action, key] of Object.entries(defaults)) {
            await window.api.setHotkey(action, key)
        }
        setHotkeys(defaults)
    }, [])

    return (
        <div className="hotkey-settings">
            <HelpTooltip text="Configure keyboard shortcuts for the overlay, item scanning, and gear reports. These work globally, even in-game." placement="bottom" className="help-tooltip-wrapper--block">
                <button
                    className={`hotkey-settings__toggle ${isOpen ? 'active' : ''}`}
                    onClick={() => setIsOpen(!isOpen)}
                >
                    <span>⌨️ Hotkey Settings</span>
                    <span className="hotkey-settings__arrow">{isOpen ? '▲' : '▼'}</span>
                </button>
            </HelpTooltip>

            {isOpen && (
                <div className="hotkey-settings__panel" ref={recorderRef}>
                    <div className="hotkey-settings__list">
                        {HOTKEY_ACTIONS.map((action) => (
                            <div key={action.key} className="hotkey-settings__row">
                                <div className="hotkey-settings__action">
                                    <span className="hotkey-settings__icon">{action.icon}</span>
                                    <div className="hotkey-settings__info">
                                        <span className="hotkey-settings__label">{action.label}</span>
                                        <span className="hotkey-settings__desc">{action.description}</span>
                                    </div>
                                </div>
                                <button
                                    className={`hotkey-settings__key-badge ${recording === action.key ? 'hotkey-settings__key-badge--recording' : ''}`}
                                    onClick={() => setRecording(recording === action.key ? null : action.key)}
                                    title={recording === action.key ? 'Press any key... (ESC to cancel)' : 'Click to change'}
                                >
                                    {recording === action.key ? (
                                        <span className="hotkey-settings__recording-text">Press a key…</span>
                                    ) : (
                                        <span>{hotkeys[action.key] || '—'}</span>
                                    )}
                                </button>
                            </div>
                        ))}
                    </div>

                    {conflict && (
                        <div className="hotkey-settings__conflict">
                            ⚠️ {conflict}
                        </div>
                    )}

                    <div className="hotkey-settings__footer">
                        <HelpTooltip text="Resets all hotkeys back to F6 (overlay), F7 (scan), F8 (report)." placement="top">
                            <button className="hotkey-settings__reset" onClick={handleReset}>
                                ↺ Reset to Defaults
                            </button>
                        </HelpTooltip>
                        <span className="hotkey-settings__hint">
                            Click a key badge to rebind • ESC to cancel
                        </span>
                    </div>
                </div>
            )}
        </div>
    )
}

export default HotkeySettings
