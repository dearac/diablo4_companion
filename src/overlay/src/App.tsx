import { useState, useEffect, useCallback } from 'react'
import type { RawBuildData, ScanMode, ScanVerdict, ScannedGearPiece } from '../../shared/types'
import OverlayHeader from './components/OverlayHeader'
import TabBar from './components/TabBar'
import type { TabId } from './components/TabBar'
import SkillsPanel from './components/SkillsPanel'
import ParagonPanel from './components/ParagonPanel'
import GearPanel from './components/GearPanel'
import OverlayFooter from './components/OverlayFooter'
import ScanControls from './components/ScanControls'
import VerdictCard from './components/VerdictCard'

/** Shape of a scan result received from the main process */
interface ScanResult {
  mode: ScanMode
  verdict: ScanVerdict | null
  equippedItem: ScannedGearPiece | null
  error: string | null
}

/**
 * Overlay App — The in-game HUD window.
 *
 * Receives build data from the main process via IPC.
 * Renders a compact tabbed panel docked to the right edge.
 * Uses mouse passthrough so clicks go through to the game
 * unless the user hovers over this panel.
 *
 * Also manages scan results: listens for hotkey-triggered scans
 * and displays verdict cards with auto-dismiss behavior.
 */
function App(): React.JSX.Element {
  const [buildData, setBuildData] = useState<RawBuildData | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('skills')
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)

  /** Dismiss the verdict card */
  const dismissVerdict = useCallback(() => {
    setScanResult(null)
  }, [])

  /** Listen for build data from the main process */
  useEffect(() => {
    window.api.onBuildData((data) => {
      setBuildData(data)
    })

    // Tell main process we're ready to receive data
    window.api.overlayReady()
  }, [])

  /** Listen for scan results from the main process (hotkey-triggered) */
  useEffect(() => {
    window.api.onScanResult((result: ScanResult) => {
      setScanResult(result)
    })
  }, [])

  /** Mouse passthrough: interactive when hovering, click-through when not */
  const handleMouseEnter = (): void => {
    window.api.setIgnoreMouseEvents(false)
  }

  const handleMouseLeave = (): void => {
    window.api.setIgnoreMouseEvents(true, { forward: true })
  }

  if (!buildData) {
    return <div id="overlay-root" />
  }

  return (
    <div id="overlay-root">
      <div
        className="overlay-panel"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <OverlayHeader buildName={buildData.name} d4Class={buildData.d4Class} />
        <ScanControls />
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="tab-content">
          {activeTab === 'skills' && <SkillsPanel skills={buildData.skills} />}
          {activeTab === 'paragon' && <ParagonPanel boards={buildData.paragonBoards} />}
          {activeTab === 'gear' && (
            <GearPanel gearSlots={buildData.gearSlots} activeRunes={buildData.activeRunes || []} />
          )}
        </div>

        <OverlayFooter />
      </div>

      {/* Verdict card — slides in from the left on scan */}
      <VerdictCard result={scanResult} onDismiss={dismissVerdict} />
    </div>
  )
}

export default App
