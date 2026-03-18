import { useState, useEffect } from 'react'
import type { RawBuildData, IGearVerdict, IInventoryVerdict, IEquippedGear } from '../../shared/types'
import OverlayHeader from './components/OverlayHeader'
import TabBar from './components/TabBar'
import type { TabId } from './components/TabBar'
import SkillsPanel from './components/SkillsPanel'
import ParagonPanel from './components/ParagonPanel'
import GearPanel from './components/GearPanel'
import GearVerdictPanel from './components/GearVerdictPanel'
import ScanModeToggle from './components/ScanModeToggle'
import ScanToast from './components/ScanToast'
import OverlayFooter from './components/OverlayFooter'

/**
 * Overlay App — The in-game HUD window.
 *
 * Receives build data from the main process via IPC.
 * Renders a compact tabbed panel docked to the right edge.
 * Uses mouse passthrough so clicks go through to the game
 * unless the user hovers over this panel.
 *
 * Now also handles:
 *   - Scan mode toggle (Equip vs Inventory)
 *   - Scan result toasts
 *   - Gear verdict panel
 */
function App(): React.JSX.Element {
  const [buildData, setBuildData] = useState<RawBuildData | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('skills')

  // OCR Scanner state
  const [isEquipMode, setIsEquipMode] = useState(false)
  const [buildVerdicts, setBuildVerdicts] = useState<IGearVerdict[]>([])
  const [inventoryVerdict, setInventoryVerdict] = useState<IInventoryVerdict | null>(null)
  const [equippedGear, setEquippedGear] = useState<IEquippedGear | null>(null)

  /** Listen for build data from the main process */
  useEffect(() => {
    window.api.onBuildData((data) => {
      setBuildData(data)
    })

    // Tell main process we're ready to receive data
    window.api.overlayReady()
  }, [])

  /** Listen for scan mode changes and equipment updates */
  useEffect(() => {
    if (!window.electron?.ipcRenderer) return

    // Listen for equipped gear updates
    window.electron.ipcRenderer.on('equipped-gear-updated', (_event, data: IEquippedGear) => {
      setEquippedGear(data)
    })

    // Listen for build verdicts
    window.electron.ipcRenderer.on('build-verdicts', (_event, data: IGearVerdict[]) => {
      setBuildVerdicts(data)
    })

    // Listen for inventory verdicts
    window.electron.ipcRenderer.on('inventory-verdict', (_event, data: IInventoryVerdict) => {
      setInventoryVerdict(data)
    })

    return () => {
      window.electron.ipcRenderer.removeAllListeners('equipped-gear-updated')
      window.electron.ipcRenderer.removeAllListeners('build-verdicts')
      window.electron.ipcRenderer.removeAllListeners('inventory-verdict')
    }
  }, [])

  /** Notify main process when scan mode changes */
  const handleModeToggle = (equip: boolean): void => {
    setIsEquipMode(equip)
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.send('set-scan-mode', equip ? 'equip' : 'inventory')
    }
  }

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
      {/* Toast notifications — always visible, floats above everything */}
      <ScanToast />

      <div
        className="overlay-panel"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <OverlayHeader buildName={buildData.name} d4Class={buildData.d4Class} />

        {/* Scan mode toggle in the header area */}
        <ScanModeToggle isEquipMode={isEquipMode} onToggle={handleModeToggle} />

        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="tab-content">
          {activeTab === 'skills' && <SkillsPanel skills={buildData.skills} />}
          {activeTab === 'paragon' && <ParagonPanel boards={buildData.paragonBoards} />}
          {activeTab === 'gear' && (
            isEquipMode || buildVerdicts.length > 0 || inventoryVerdict ? (
              <GearVerdictPanel
                buildSlots={buildData.gearSlots}
                buildVerdicts={buildVerdicts}
                equippedGear={equippedGear}
                inventoryVerdict={inventoryVerdict}
                isEquipMode={isEquipMode}
              />
            ) : (
              <GearPanel
                gearSlots={buildData.gearSlots}
                activeRunes={buildData.activeRunes || []}
              />
            )
          )}
        </div>

        <OverlayFooter />
      </div>
    </div>
  )
}

export default App
