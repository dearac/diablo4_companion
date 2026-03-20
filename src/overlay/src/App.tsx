import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  RawBuildData,
  ScanMode,
  ScanVerdict,
  ScannedGearPiece,
  ScanHistoryEntry
} from '../../shared/types'
import OverlayHeader from './components/OverlayHeader'
import TabBar from './components/TabBar'
import type { TabId } from './components/TabBar'
import SkillsPanel from './components/SkillsPanel'
import ParagonPanel from './components/ParagonPanel'
import GearPanel from './components/GearPanel'
import OverlayFooter from './components/OverlayFooter'
import ScanControls from './components/ScanControls'
import VerdictCard from './components/VerdictCard'
import ScansPanel from './components/ScansPanel'

/** Shape of a scan result received from the main process */
interface ScanResult {
  mode: ScanMode
  verdict: ScanVerdict | null
  equippedItem: ScannedGearPiece | null
  error: string | null
}

/** Minimum panel dimensions */
const MIN_WIDTH = 260
const MIN_HEIGHT = 300

/**
 * Overlay App — The in-game HUD window.
 *
 * Receives build data from the main process via IPC.
 * Renders a compact tabbed panel that is draggable and resizable.
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
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>([])
  const [equippedGear, setEquippedGear] = useState<Record<string, ScannedGearPiece>>({})

  // Panel position & size — stored as CSS pixel values
  const [panelX, setPanelX] = useState<number>(window.innerWidth - 400)
  const [panelY, setPanelY] = useState<number>(Math.round(window.innerHeight * 0.1))
  const [panelW, setPanelW] = useState<number>(380)
  const [panelH, setPanelH] = useState<number>(Math.round(window.innerHeight * 0.7))

  // Refs for drag/resize tracking
  const isDragging = useRef(false)
  const isResizing = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const panelStart = useRef({ x: 0, y: 0, w: 0, h: 0 })

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
      if (result.mode === 'compare' && result.verdict) {
        window.api.getScanHistory().then(setScanHistory)
      }
      if (result.mode === 'equip' && result.equippedItem) {
        window.api.getEquippedGear().then(setEquippedGear)
      }
    })
  }, [])

  /** Load scan history and equipped gear on mount */
  useEffect(() => {
    window.api.getScanHistory().then(setScanHistory)
    window.api.getEquippedGear().then(setEquippedGear)
  }, [])

  /** Clear all scan history */
  const handleClearScans = useCallback(async () => {
    await window.api.clearScanHistory()
    setScanHistory([])
  }, [])

  // ── Drag logic ──
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      // Only start drag from the header area (not buttons/inputs)
      if ((e.target as HTMLElement).closest('button, input, select')) return
      isDragging.current = true
      dragStart.current = { x: e.clientX, y: e.clientY }
      panelStart.current = { x: panelX, y: panelY, w: panelW, h: panelH }
      e.preventDefault()
    },
    [panelX, panelY, panelW, panelH]
  )

  // ── Resize logic ──
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      isResizing.current = true
      dragStart.current = { x: e.clientX, y: e.clientY }
      panelStart.current = { x: panelX, y: panelY, w: panelW, h: panelH }
      e.preventDefault()
      e.stopPropagation()
    },
    [panelX, panelY, panelW, panelH]
  )

  /** Global mousemove and mouseup for drag/resize */
  useEffect(() => {
    const handleMove = (e: MouseEvent): void => {
      if (isDragging.current) {
        const dx = e.clientX - dragStart.current.x
        const dy = e.clientY - dragStart.current.y
        setPanelX(panelStart.current.x + dx)
        setPanelY(panelStart.current.y + dy)
      }
      if (isResizing.current) {
        const dx = e.clientX - dragStart.current.x
        const dy = e.clientY - dragStart.current.y
        setPanelW(Math.max(MIN_WIDTH, panelStart.current.w + dx))
        setPanelH(Math.max(MIN_HEIGHT, panelStart.current.h + dy))
      }
    }

    const handleUp = (): void => {
      isDragging.current = false
      isResizing.current = false
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [])

  /** Mouse passthrough: interactive when hovering, click-through when not */
  const handleMouseEnter = (): void => {
    window.api.setIgnoreMouseEvents(false)
  }

  const handleMouseLeave = (): void => {
    if (!isDragging.current && !isResizing.current) {
      window.api.setIgnoreMouseEvents(true, { forward: true })
    }
  }

  if (!buildData) {
    return <div id="overlay-root" />
  }

  return (
    <div id="overlay-root">
      <div
        className="overlay-panel"
        style={{
          position: 'fixed',
          left: panelX,
          top: panelY,
          width: panelW,
          height: panelH,
          right: 'auto'
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Drag handle — the header area */}
        <div className="overlay-panel__drag-handle" onMouseDown={handleDragStart}>
          <OverlayHeader buildName={buildData.name} d4Class={buildData.d4Class} />
        </div>
        <ScanControls />
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="tab-content">
          {activeTab === 'skills' && <SkillsPanel skills={buildData.skills} />}
          {activeTab === 'paragon' && <ParagonPanel boards={buildData.paragonBoards} />}
          {activeTab === 'gear' && (
            <GearPanel
              gearSlots={buildData.gearSlots}
              activeRunes={buildData.activeRunes || []}
              equippedGear={equippedGear}
            />
          )}
          {activeTab === 'scans' && <ScansPanel entries={scanHistory} onClear={handleClearScans} />}
        </div>

        <OverlayFooter />

        {/* Resize handle — bottom-right corner */}
        <div className="overlay-panel__resize-handle" onMouseDown={handleResizeStart} />
      </div>

      {/* Verdict card — slides in from the left on scan */}
      <VerdictCard result={scanResult} onDismiss={dismissVerdict} />
    </div>
  )
}

export default App
