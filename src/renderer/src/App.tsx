import { useState, useEffect } from 'react'
import type { RawBuildData, ScanHistoryEntry, ScanVerdict } from '../../shared/types'
import ImportForm from './components/ImportForm'
import StatusIndicator from './components/StatusIndicator'
import BuildSummaryCard from './components/BuildSummaryCard'
import BuildLibrary from './components/BuildLibrary'
import UpdateBanner from './components/UpdateBanner'
import SkillsPanel from './components/SkillsPanel'
import ParagonPanel from './components/ParagonPanel'
import GearTab from './components/GearTab'
import ScansTab from './components/ScansTab'
import SettingsTab from './components/SettingsTab'
import ScanControls from './components/ScanControls'
import { playShutterSound, playSuccessSound, playErrorSound } from './utils/audio'

/**
 * Diablo IV Companion — Main Application
 * 
 * 6-Tab Layout:
 * 1. Builds — Import and Library
 * 2. Gear — 2-Column Grid with Build Comparison
 * 3. Skills — Skills grouped by Tier
 * 4. Paragon — Interactive Board Canvas
 * 5. Scans — Inbox + Side-by-Side Comparison
 * 6. Settings — Hotkeys, Modes, Maintenance
 */

type MainTab = 'builds' | 'gear' | 'skills' | 'paragon' | 'scans' | 'settings'

const TAB_LABELS: { id: MainTab; label: string; icon: string }[] = [
  { id: 'builds', label: 'Builds', icon: '📦' },
  { id: 'gear', label: 'Gear', icon: '🛡️' },
  { id: 'skills', label: 'Skills', icon: '⚔️' },
  { id: 'paragon', label: 'Paragon', icon: '🌀' },
  { id: 'scans', label: 'Scans', icon: '🔍' },
  { id: 'settings', label: 'Settings', icon: '⚙️' }
]

function App(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<MainTab>('builds')
  const [buildData, setBuildData] = useState<RawBuildData | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [importProgress, setImportProgress] = useState<{ step: number; totalSteps: number; label: string } | null>(null)

  // Scan State
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>([])
  const [latestScanResult, setLatestScanResult] = useState<{
    verdict: ScanVerdict | null
    error: string | null
  } | null>(null)

  // Load initial data
  useEffect(() => {
    window.api.getScanHistory().then(setScanHistory)
    window.api.getCurrentBuild().then((data) => {
      if (data) setBuildData(data)
    })
  }, [])

  // Listen for IPC events
  useEffect(() => {
    // Import progress
    const removeImportListener = window.api.onImportProgress(setImportProgress)

    // Scan started (play shutter)
    const removeScanStartedListener = window.api.onScanStarted(() => {
      playShutterSound()
    })

    // Scan Result (audio + auto-switch)
    const removeScanResultListener = window.api.onScanResult((result) => {
      if (result.error) {
        playErrorSound()
      } else {
        playSuccessSound()
      }

      setLatestScanResult(result)

      // Add verdict to scan history
      if (result.verdict) {
        setScanHistory((prev) => [
          {
            verdict: result.verdict!,
            scannedAt: Date.now()
          },
          ...prev
        ])
        setActiveTab('scans')
      }
    })

    return () => {
      removeImportListener()
      removeScanStartedListener()
      removeScanResultListener()
    }
  }, [])

  const handleImportStart = (): void => {
    setStatus('loading')
    setErrorMessage('')
    setBuildData(null)
    setImportProgress(null)
  }

  const handleImportSuccess = (result: { build: RawBuildData; savedId: string }): void => {
    setBuildData(result.build)
    setStatus('success')
    setImportProgress(null)
  }

  const handleImportError = (error: string): void => {
    setStatus('error')
    setErrorMessage(error)
    setImportProgress(null)
  }

  const handleLoadBuild = (data: RawBuildData | { data: RawBuildData }): void => {
    const rawData = 'data' in data ? data.data : data
    setBuildData(rawData)
    setStatus('success')
  }

  const renderCurrentTab = (): React.JSX.Element => {
    switch (activeTab) {
      case 'builds':
        return (
          <div className="tab-pane">
            <ImportForm onImportStart={handleImportStart} onImportSuccess={handleImportSuccess} onImportError={handleImportError} isLoading={status === 'loading'} />
            <StatusIndicator status={status} errorMessage={errorMessage} progress={importProgress} />
            {buildData && status === 'success' && (
              <BuildSummaryCard build={buildData} onLaunchOverlay={() => {}} />
            )}
            <BuildLibrary onLoadBuild={handleLoadBuild} refreshTrigger={0} />
          </div>
        )
      case 'gear':
        return <GearTab buildData={buildData} />
      case 'skills':
        return (
          <div className="tab-pane">
            {buildData ? (
              <SkillsPanel skills={buildData.skills} />
            ) : (
              <p className="empty-state">No build loaded.</p>
            )}
          </div>
        )
      case 'paragon':
        return (
          <div className="tab-pane" style={{ height: '100%' }}>
            {buildData ? (
              <ParagonPanel boards={buildData.paragonBoards} />
            ) : (
              <p className="empty-state">No build loaded.</p>
            )}
          </div>
        )
      case 'scans':
        return (
          <ScansTab
            scanHistory={scanHistory}
            buildData={buildData}
            latestScanResult={latestScanResult}
            onClearHistory={async () => {
              await window.api.clearScanHistory()
              setScanHistory([])
              setLatestScanResult(null)
            }}
          />
        )
      case 'settings':
        return <SettingsTab />
      default:
        return <div className="tab-pane">Unknown tab</div>
    }
  }

  return (
    <div className="app-shell">
      <UpdateBanner />
      
      <header className="app-header">
        <div className="app-header__title-group">
          <h1 className="app-header__title">🩸 Diablo IV Companion</h1>
          {buildData && <span className="app-header__build-name">{buildData.name}</span>}
        </div>
        
        <nav className="app-tabs">
          {TAB_LABELS.map((tab) => (
            <button
              key={tab.id}
              className={`app-tabs__tab ${activeTab === tab.id ? 'app-tabs__tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="app-main">
        {renderCurrentTab()}
      </main>

      <footer className="status-bar">
        <div className="status-bar__item">
          <span className="status-dot status-dot--ok" />
          <span>Services Online</span>
        </div>
        <div className="status-bar__item">
          <span>Build: {buildData?.name || 'None'}</span>
        </div>
        <div className="status-bar__item">
          <span>{scanHistory.length} Scans in History</span>
        </div>
        <ScanControls />
      </footer>
    </div>
  )
}

export default App
