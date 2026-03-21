import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * HotkeySettings — Collapsible panel for viewing and rebinding hotkeys.
 *
 * Features:
 * - Shows current key assignments with visual status (✓ registered / ⚠ failed)
 * - Press-to-record: click a key badge, press any key to rebind
 * - Conflict detection: warns when two actions share the same key
 * - Reset to defaults (F6/F7/F8)
 */

/** Metadata for each hotkey action */
const HOTKEY_META: Record<string, { icon: string; label: string; desc: string }> = {
  scan: { icon: '📸', label: 'Scan Item', desc: 'Capture and analyze a gear tooltip' },
  report: { icon: '📊', label: 'Gear Report', desc: 'Toggle the gear report panel' },
  toggle: { icon: '👁️', label: 'Toggle Overlay', desc: 'Show or hide the overlay' }
}

/** Ordered list of actions to display */
const ACTIONS = ['scan', 'report', 'toggle'] as const

/**
 * Converts a DOM KeyboardEvent into an Electron accelerator string.
 * e.g. Ctrl+Shift+F9, Alt+G, F7
 */
function keyEventToAccelerator(e: KeyboardEvent): string | null {
  // Ignore bare modifier presses (user hasn't pressed the actual key yet)
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null

  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')
  if (e.metaKey) parts.push('Super')

  // Normalize key name to Electron accelerator format
  let key = e.key
  if (key === ' ') key = 'Space'
  else if (key === 'ArrowUp') key = 'Up'
  else if (key === 'ArrowDown') key = 'Down'
  else if (key === 'ArrowLeft') key = 'Left'
  else if (key === 'ArrowRight') key = 'Right'
  else if (key === 'Escape') key = 'Escape'
  else if (key.length === 1) key = key.toUpperCase()

  parts.push(key)
  return parts.join('+')
}

export default function HotkeySettings(): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const [hotkeys, setHotkeys] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<Record<string, boolean>>({})
  const [recording, setRecording] = useState<string | null>(null) // action being recorded
  const [conflict, setConflict] = useState<string | null>(null)
  const recordingRef = useRef<string | null>(null)

  // Keep ref in sync for the keyboard listener closure
  recordingRef.current = recording

  /** Fetch initial hotkey config and status */
  useEffect(() => {
    window.api.getHotkeys().then(setHotkeys)
    window.api.getHotkeyStatus().then(setStatus)

    // Listen for status pushes (e.g. after re-registration)
    window.api.onHotkeyStatus((newStatus) => {
      setStatus(newStatus)
    })
  }, [])

  /** Global keyboard listener for press-to-record */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (!recordingRef.current) return

      e.preventDefault()
      e.stopPropagation()

      // Escape cancels recording
      if (e.key === 'Escape') {
        setRecording(null)
        setConflict(null)
        return
      }

      const accelerator = keyEventToAccelerator(e)
      if (!accelerator) return // bare modifier, wait for actual key

      const action = recordingRef.current

      // Check for conflicts with OTHER actions
      const conflictAction = Object.entries(hotkeys).find(
        ([a, k]) => a !== action && k === accelerator
      )

      if (conflictAction) {
        const meta = HOTKEY_META[conflictAction[0]]
        setConflict(`"${accelerator}" is already used by ${meta?.label ?? conflictAction[0]}`)
        return
      }

      // Apply the new binding via IPC
      setConflict(null)
      setRecording(null)
      window.api.setHotkey(action, accelerator).then((updated) => {
        setHotkeys(updated)
      })
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [hotkeys])

  /** Start recording a new key for an action */
  const startRecording = useCallback((action: string) => {
    setRecording(action)
    setConflict(null)
  }, [])

  /** Reset all hotkeys to factory defaults */
  const handleReset = useCallback(async () => {
    const updated = await window.api.resetHotkeys()
    setHotkeys(updated)
    setRecording(null)
    setConflict(null)
  }, [])

  return (
    <div className="hotkey-settings" id="hotkey-settings">
      <button
        className={`hotkey-settings__toggle ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        id="hotkey-settings-toggle"
      >
        <span>⌨️ Hotkey Settings</span>
        <span
          className="hotkey-settings__arrow"
          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          ▼
        </span>
      </button>

      {isOpen && (
        <div className="hotkey-settings__panel">
          <div className="hotkey-settings__list">
            {ACTIONS.map((action) => {
              const meta = HOTKEY_META[action]
              const key = hotkeys[action] ?? '...'
              const isRecording = recording === action
              const isOk = status[action]

              return (
                <div key={action} className="hotkey-settings__row">
                  <div className="hotkey-settings__action">
                    <span className="hotkey-settings__icon">{meta.icon}</span>
                    <div className="hotkey-settings__info">
                      <span className="hotkey-settings__label">{meta.label}</span>
                      <span className="hotkey-settings__desc">{meta.desc}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* Status indicator */}
                    {isOk !== undefined && (
                      <span
                        className={`hotkey-settings__status ${isOk ? 'hotkey-settings__status--ok' : 'hotkey-settings__status--fail'}`}
                        title={
                          isOk
                            ? 'Registered successfully'
                            : 'Registration failed — key may be claimed by another app'
                        }
                      >
                        {isOk ? '✓' : '⚠'}
                      </span>
                    )}

                    {/* Key badge / recording state */}
                    <button
                      className={`hotkey-settings__key-badge ${isRecording ? 'hotkey-settings__key-badge--recording' : ''}`}
                      onClick={() => startRecording(action)}
                      id={`hotkey-badge-${action}`}
                    >
                      {isRecording ? (
                        <span className="hotkey-settings__recording-text">Press a key…</span>
                      ) : (
                        key
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Conflict warning */}
          {conflict && (
            <div className="hotkey-settings__conflict" id="hotkey-conflict-warning">
              ⚠ {conflict}
            </div>
          )}

          {/* Footer */}
          <div className="hotkey-settings__footer">
            <button className="hotkey-settings__reset" onClick={handleReset} id="hotkey-reset-btn">
              ↺ Reset to Defaults
            </button>
            <span className="hotkey-settings__hint">Click a key to rebind</span>
          </div>
        </div>
      )}
    </div>
  )
}
