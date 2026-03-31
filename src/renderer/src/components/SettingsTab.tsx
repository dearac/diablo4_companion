import { useState, useEffect, useRef } from 'react'

const HOTKEY_META: Record<string, { icon: string; label: string; desc: string }> = {
  scan: { icon: '📸', label: 'Scan Item', desc: 'Capture and analyze a gear tooltip' },
  report: { icon: '📊', label: 'Toggle Always-on-Top', desc: 'Toggle the application overlay mode' },
  toggle: { icon: '👁️', label: 'Toggle State', desc: 'Reserved for future toggle actions' },
  detach: { icon: '⊞', label: 'Detach Board', desc: 'Cycle to the next paragon board overlay' },
  boardScan: { icon: '🔍', label: 'Board Scan', desc: 'OCR scan to identify & overlay the paragon board' }
}

const ACTIONS = ['scan', 'report', 'detach', 'boardScan'] as const

function keyEventToAccelerator(e: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')
  if (e.metaKey) parts.push('Super')
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

function SettingsTab(): React.JSX.Element {
  const [hotkeys, setHotkeys] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<Record<string, boolean>>({})
  const [recording, setRecording] = useState<string | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)
  const [maintenanceStatus, setMaintenanceStatus] = useState<Record<string, string>>({})

  const recordingRef = useRef<string | null>(null)
  recordingRef.current = recording

  useEffect(() => {
    window.api.getHotkeys().then(setHotkeys)
    window.api.getHotkeyStatus().then(setStatus)
    window.api.onHotkeyStatus(setStatus)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (!recordingRef.current) return
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setRecording(null)
        setConflict(null)
        return
      }
      const accelerator = keyEventToAccelerator(e)
      if (!accelerator) return
      const action = recordingRef.current
      const conflictAction = Object.entries(hotkeys).find(([a, k]) => a !== action && k === accelerator)
      if (conflictAction) {
        setConflict(`"${accelerator}" is already used by ${HOTKEY_META[conflictAction[0]]?.label || conflictAction[0]}`)
        return
      }
      setConflict(null)
      setRecording(null)
      window.api.setHotkey(action, accelerator).then(setHotkeys)
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [hotkeys])

  const triggerMaintenance = async (id: string, fn: () => Promise<any>): Promise<void> => {
    setMaintenanceStatus(prev => ({ ...prev, [id]: 'loading' }))
    try {
      await fn()
      setMaintenanceStatus(prev => ({ ...prev, [id]: 'success' }))
      setTimeout(() => setMaintenanceStatus(prev => ({ ...prev, [id]: '' })), 3000)
    } catch (err) {
      setMaintenanceStatus(prev => ({ ...prev, [id]: 'error' }))
    }
  }

  return (
    <div className="settings-pane" id="settings-tab">
      <section className="settings-section">
        <h3 className="settings-section__title">Keyboard Shortcuts</h3>
        <p className="settings-section__desc">Click a key to rebind. Conflict warnings will appear if a key is already in use.</p>
        
        <div className="hotkey-list">
          {ACTIONS.map(action => {
            const meta = HOTKEY_META[action]
            const isRecording = recording === action
            const isOk = status[action]
            return (
              <div key={action} className="hotkey-row">
                <div className="hotkey-row__info">
                  <span className="hotkey-row__icon">{meta.icon}</span>
                  <div>
                    <div className="hotkey-row__label">{meta.label}</div>
                    <div className="hotkey-row__desc">{meta.desc}</div>
                  </div>
                </div>
                <div className="hotkey-row__controls">
                  {isOk !== undefined && (
                    <span className={`status-dot ${isOk ? 'status-dot--ok' : 'status-dot--error'}`} />
                  )}
                  <button 
                    className={`hotkey-badge ${isRecording ? 'hotkey-badge--recording' : ''}`}
                    onClick={() => setRecording(action)}
                  >
                    {isRecording ? 'Press a key...' : (hotkeys[action] || '...')}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        {conflict && <div className="settings-error">⚠️ {conflict}</div>}
        <button className="btn btn--outline btn--sm" style={{ marginTop: '1rem' }} onClick={() => window.api.resetHotkeys().then(setHotkeys)}>
          Reset to Defaults
        </button>
      </section>

      <section className="settings-section">
        <h3 className="settings-section__title">Maintenance & Data</h3>
        <div className="maintenance-grid">
          <div className="maintenance-item">
            <div className="maintenance-item__info">
              <div className="maintenance-item__label">Paragon Cache</div>
              <div className="maintenance-item__desc">Force reload all board image data</div>
            </div>
            <button 
              className="btn btn--outline btn--sm"
              onClick={() => triggerMaintenance('cache', window.api.clearParagonCache)}
            >
              {maintenanceStatus.cache === 'success' ? '✓ Cleared' : '🔄 Clear Cache'}
            </button>
          </div>

          <div className="maintenance-item">
            <div className="maintenance-item__info">
              <div className="maintenance-item__label">Board Calibration</div>
              <div className="maintenance-item__desc">Reset the screen region for board scans</div>
            </div>
            <button 
              className="btn btn--outline btn--sm"
              onClick={() => triggerMaintenance('calib', window.api.clearBoardCalibration)}
            >
              {maintenanceStatus.calib === 'success' ? '✓ Reset' : '📐 Reset Calibration'}
            </button>
          </div>


          <div className="maintenance-item">
            <div className="maintenance-item__info">
              <div className="maintenance-item__label">Scan History</div>
              <div className="maintenance-item__desc">Delete all past comparison results</div>
            </div>
            <button 
              className="btn btn--outline btn--sm"
              onClick={() => triggerMaintenance('history', window.api.clearScanHistory)}
            >
              {maintenanceStatus.history === 'success' ? '✓ Deleted' : '🧹 Clear History'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

export default SettingsTab
