import { useState, useCallback } from 'react'
import type { RawBuildData } from '../../shared/types'
import ImportForm from './components/ImportForm'
import StatusIndicator from './components/StatusIndicator'
import BuildSummaryCard from './components/BuildSummaryCard'
import BuildLibrary from './components/BuildLibrary'
import UpdateBanner from './components/UpdateBanner'
import EquippedGearTab from './components/EquippedGearTab'
import ScanHistoryTab from './components/ScanHistoryTab'

/**
 * Config Window App — The build import launcher + equipment & scan dashboard.
 *
 * Tabs:
 * 1. "Builds" — Import/browse builds + launch overlay (original flow)
 * 2. "Equipped" — View all equipped gear with build comparison
 * 3. "Scans" — Recently scanned items with verdicts
 */
type ImportStatus = 'idle' | 'loading' | 'success' | 'error'
type MainTab = 'builds' | 'equipped' | 'scans'

function App(): React.JSX.Element {
  const [status, setStatus] = useState<ImportStatus>('idle')
  const [buildData, setBuildData] = useState<RawBuildData | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [refreshCounter, setRefreshCounter] = useState<number>(0)
  const [cacheCleared, setCacheCleared] = useState<boolean>(false)
  const [activeTab, setActiveTab] = useState<MainTab>('builds')

  /** Called when the user clicks Import */
  const handleImportStart = (): void => {
    setStatus('loading')
    setErrorMessage('')
    setBuildData(null)
  }

  /** Called when the import succeeds */
  const handleImportSuccess = (result: { build: RawBuildData; savedId: string }): void => {
    setBuildData(result.build)
    setStatus('success')
    setRefreshCounter((c) => c + 1) // Trigger library refresh
  }

  /** Called when the import fails */
  const handleImportError = (error: string): void => {
    setErrorMessage(error)
    setStatus('error')
  }

  /** Load a build from the library */
  const handleLoadBuild = (data: RawBuildData): void => {
    setBuildData(data)
    setStatus('success')
  }

  /** Launch the overlay window via IPC */
  const handleLaunchOverlay = (): void => {
    window.api.launchOverlay()
  }

  /** Clear paragon board cache */
  const handleClearCache = useCallback(async (): Promise<void> => {
    await window.api.clearParagonCache()
    setCacheCleared(true)
    setTimeout(() => setCacheCleared(false), 3000)
  }, [])

  return (
    <div className="config-window">
      <UpdateBanner />
      <header className="config-header">
        <h1 className="config-header__title">Diablo IV Companion</h1>
        <p className="config-header__subtitle">Build Importer</p>
        <hr className="config-header__divider" />
      </header>

      {/* ── Main Tab Bar ── */}
      <nav className="main-tabs" id="main-tab-bar">
        <button
          className={`main-tabs__tab ${activeTab === 'builds' ? 'main-tabs__tab--active' : ''}`}
          onClick={() => setActiveTab('builds')}
        >
          📦 Builds
        </button>
        <button
          className={`main-tabs__tab ${activeTab === 'equipped' ? 'main-tabs__tab--active' : ''}`}
          onClick={() => setActiveTab('equipped')}
        >
          🛡️ Equipped
        </button>
        <button
          className={`main-tabs__tab ${activeTab === 'scans' ? 'main-tabs__tab--active' : ''}`}
          onClick={() => setActiveTab('scans')}
        >
          🔍 Scans
        </button>
      </nav>

      <main className="config-main">
        {/* ── Builds Tab (original flow) ── */}
        {activeTab === 'builds' && (
          <>
            <ImportForm
              onImportStart={handleImportStart}
              onImportSuccess={handleImportSuccess}
              onImportError={handleImportError}
              isLoading={status === 'loading'}
            />

            <StatusIndicator status={status} errorMessage={errorMessage} />

            {status === 'success' && buildData && (
              <BuildSummaryCard build={buildData} onLaunchOverlay={handleLaunchOverlay} />
            )}

            <BuildLibrary onLoadBuild={handleLoadBuild} refreshTrigger={refreshCounter} />
          </>
        )}

        {/* ── Equipped Gear Tab ── */}
        {activeTab === 'equipped' && <EquippedGearTab buildData={buildData} />}

        {/* ── Scan History Tab ── */}
        {activeTab === 'scans' && <ScanHistoryTab />}
      </main>

      <footer className="config-footer">
        <span>Toggle Overlay: F6</span>
        <button
          className="config-footer__clear-cache"
          onClick={handleClearCache}
          title="Clear cached board data (use after a game update)"
        >
          {cacheCleared ? '✓ Cache Cleared' : '🔄 Clear Board Cache'}
        </button>
      </footer>
    </div>
  )
}

export default App
