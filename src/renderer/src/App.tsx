import { useState, useCallback } from 'react'
import type { RawBuildData } from '../../shared/types'
import ImportForm from './components/ImportForm'
import StatusIndicator from './components/StatusIndicator'
import BuildSummaryCard from './components/BuildSummaryCard'
import BuildLibrary from './components/BuildLibrary'
import HotkeySettings from './components/HotkeySettings'

/**
 * Config Window App — The build import launcher.
 *
 * This is a focused, single-purpose window:
 * 1. Paste a build URL → scrape + auto-save
 * 2. See the import result
 * 3. Browse saved builds
 * 4. Configure hotkeys
 * 5. Launch the overlay
 */
type ImportStatus = 'idle' | 'loading' | 'success' | 'error'

function App(): React.JSX.Element {
  const [status, setStatus] = useState<ImportStatus>('idle')
  const [buildData, setBuildData] = useState<RawBuildData | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [refreshCounter, setRefreshCounter] = useState<number>(0)
  const [cacheCleared, setCacheCleared] = useState<boolean>(false)

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
      <header className="config-header">
        <h1 className="config-header__title">Diablo IV Companion</h1>
        <p className="config-header__subtitle">Build Importer</p>
        <hr className="config-header__divider" />
      </header>

      <main className="config-main">
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

        <HotkeySettings />
      </main>

      <footer className="config-footer">
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
