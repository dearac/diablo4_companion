import { useState, useEffect } from 'react'
import type { ScanMode } from '../../../shared/types'

/**
 * ScanControls — Mode toggle and scan status display.
 *
 * Sits in the overlay header area and shows:
 * - Current scan mode (Compare vs Equip) with a toggle button
 * - Scan hotkey reminder (fetched dynamically from main process)
 */

interface ScanControlsProps {
  onModeChange?: (mode: ScanMode) => void
}

function ScanControls({ onModeChange }: ScanControlsProps): React.JSX.Element {
  const [scanMode, setScanMode] = useState<ScanMode>('compare')
  const [isToggling, setIsToggling] = useState(false)
  const [scanKey, setScanKey] = useState('F7')

  /** Load initial scan mode and hotkey from main process */
  useEffect(() => {
    window.api.getScanMode().then(setScanMode)
    window.api.getHotkeys().then((keys) => {
      if (keys.scan) setScanKey(keys.scan)
    })
  }, [])

  /** Toggle between compare and equip modes */
  const handleToggle = async (): Promise<void> => {
    setIsToggling(true)
    try {
      const newMode = await window.api.toggleScanMode()
      setScanMode(newMode)
      onModeChange?.(newMode)
    } finally {
      setIsToggling(false)
    }
  }

  return (
    <div className="scan-controls" id="scan-controls">
      <div className="scan-controls__mode">
        <button
          id="scan-mode-toggle"
          className={`scan-controls__toggle ${scanMode === 'compare' ? 'scan-controls__toggle--compare' : 'scan-controls__toggle--equip'}`}
          onClick={handleToggle}
          disabled={isToggling}
          title="Toggle between Compare and Equip mode"
        >
          <span className="scan-controls__toggle-icon">{scanMode === 'compare' ? '⚔️' : '🛡️'}</span>
          <span className="scan-controls__toggle-label">
            {scanMode === 'compare' ? 'COMPARE' : 'EQUIP'}
          </span>
        </button>
      </div>
      <div className="scan-controls__hotkey">
        <span className="scan-controls__hotkey-label">Scan</span>
        <kbd className="scan-controls__hotkey-key">{scanKey}</kbd>
      </div>
    </div>
  )
}

export default ScanControls

