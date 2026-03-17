import { useState } from 'react'
import type { RawBuildData } from '../../shared/types'
import ImportForm from './components/ImportForm'
import StatusIndicator from './components/StatusIndicator'
import BuildSummaryCard from './components/BuildSummaryCard'

/**
 * Config Window App — The build import launcher.
 *
 * This is a focused, single-purpose window:
 * 1. Paste a build URL
 * 2. See the import result
 * 3. Launch the overlay
 */
type ImportStatus = 'idle' | 'loading' | 'success' | 'error'

function App(): React.JSX.Element {
  const [status, setStatus] = useState<ImportStatus>('idle')
  const [buildData, setBuildData] = useState<RawBuildData | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')

  /** Called when the user clicks Import */
  const handleImportStart = (): void => {
    setStatus('loading')
    setErrorMessage('')
    setBuildData(null)
  }

  /** Called when the import succeeds */
  const handleImportSuccess = (data: RawBuildData): void => {
    setBuildData(data)
    setStatus('success')
  }

  /** Called when the import fails */
  const handleImportError = (error: string): void => {
    setErrorMessage(error)
    setStatus('error')
  }

  /** Launch the overlay window via IPC */
  const handleLaunchOverlay = (): void => {
    window.api.launchOverlay()
  }

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
      </main>

      <footer className="config-footer">
        <span>Toggle Overlay: F6</span>
      </footer>
    </div>
  )
}

export default App
