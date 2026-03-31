import { useState, useEffect } from 'react'

/**
 * ScanControls — Scan hotkey display.
 *
 * Shows the current scan hotkey in the overlay header.
 * Mode toggle removed — app now operates in build-compare-only mode.
 */
function ScanControls(): React.JSX.Element {
  const [scanKey, setScanKey] = useState('F7')

  /** Load hotkey from main process */
  useEffect(() => {
    window.api.getHotkeys().then((keys) => {
      if (keys.scan) setScanKey(keys.scan)
    })
  }, [])

  return (
    <div className="scan-controls" id="scan-controls">
      <div className="scan-controls__hotkey">
        <span className="scan-controls__hotkey-label">Scan</span>
        <kbd className="scan-controls__hotkey-key">{scanKey}</kbd>
      </div>
    </div>
  )
}

export default ScanControls
