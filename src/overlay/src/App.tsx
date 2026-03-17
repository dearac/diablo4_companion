import { useState, useEffect } from 'react'
import type { RawBuildData } from '../../shared/types'
import OverlayHeader from './components/OverlayHeader'
import TabBar from './components/TabBar'
import type { TabId } from './components/TabBar'
import OverlayFooter from './components/OverlayFooter'

/**
 * Overlay App — The in-game HUD window.
 *
 * Receives build data from the main process via IPC.
 * Renders a compact tabbed panel docked to the right edge.
 * Uses mouse passthrough so clicks go through to the game
 * unless the user hovers over this panel.
 */
function App(): React.JSX.Element {
  const [buildData, setBuildData] = useState<RawBuildData | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('skills')

  /** Listen for build data from the main process */
  useEffect(() => {
    window.api.onBuildData((data) => {
      setBuildData(data)
    })

    // Tell main process we're ready to receive data
    window.api.overlayReady()
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
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="tab-content">
          {activeTab === 'skills' && <p>Skills panel — Task 6</p>}
          {activeTab === 'paragon' && <p>Paragon panel — Task 7</p>}
          {activeTab === 'gear' && <p>Gear panel — Task 8</p>}
        </div>

        <OverlayFooter />
      </div>
    </div>
  )
}

export default App
