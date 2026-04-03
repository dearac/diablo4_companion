import { useState, useEffect } from 'react'

/**
 * ScanControls — Scan hotkey display.
 *
 * Shows the current scan hotkey in the UI.
 * Mode toggle removed — app now operates in build-compare-only mode.
 */
function ScanControls(): React.JSX.Element {
  const [scanKey, setScanKey] = useState('F7')
  const [autoscan, setAutoscan] = useState(false)

  /** Load hotkey from main process */
  useEffect(() => {
    window.api.getHotkeys().then((keys) => {
      if (keys.scan) setScanKey(keys.scan)
    })
    window.api.getAutoscanState().then((state) => {
      setAutoscan(state)
    })
  }, [])

  const handleToggleAutoscan = (): void => {
    const newState = !autoscan
    setAutoscan(newState)
    window.api.toggleAutoscan(newState)
  }

  return (
    <div
      className="scan-controls"
      id="scan-controls"
      style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}
    >
      <div className="scan-controls__hotkey">
        <span className="scan-controls__hotkey-label">Scan</span>
        <kbd className="scan-controls__hotkey-key">{scanKey}</kbd>
      </div>
      <div
        className="scan-controls__autoscan"
        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
      >
        <label
          htmlFor="autoscan-toggle"
          style={{ color: '#aaa', fontSize: '13px', fontWeight: 600, textTransform: 'uppercase' }}
        >
          AUTO SCAN
        </label>
        <input
          id="autoscan-toggle"
          type="checkbox"
          checked={autoscan}
          onChange={handleToggleAutoscan}
          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
        />
      </div>
    </div>
  )
}

export default ScanControls
