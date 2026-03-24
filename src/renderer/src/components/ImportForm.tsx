import { useState } from 'react'
import type { RawBuildData } from '../../../shared/types'

/**
 * ImportForm — URL input and import button.
 *
 * Validates that the URL contains a supported domain before
 * enabling the import button. Calls window.api.importBuild()
 * on submit.
 */
interface ImportFormProps {
  onImportStart: () => void
  onImportSuccess: (result: { build: RawBuildData; savedId: string }) => void
  onImportError: (error: string) => void
  isLoading: boolean
}

const SUPPORTED_DOMAINS = ['maxroll.gg', 'd4builds.gg', 'icy-veins.com']

function ImportForm({
  onImportStart,
  onImportSuccess,
  onImportError,
  isLoading
}: ImportFormProps): React.JSX.Element {
  const [url, setUrl] = useState('')

  /** Check if the URL contains a supported domain */
  const isValidUrl = SUPPORTED_DOMAINS.some((domain) => url.toLowerCase().includes(domain))

  /** Handle form submission */
  const handleImport = async (): Promise<void> => {
    if (!isValidUrl || isLoading) return

    onImportStart()
    try {
      const data = await window.api.importBuild(url)
      onImportSuccess(data)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      onImportError(message)
    }
  }

  /** Allow Enter key to submit */
  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') handleImport()
  }

  return (
    <div className="import-form">
      <div className="import-form__input-row">
        <input
          id="url-input"
          className="import-form__input"
          type="url"
          placeholder="Paste a build URL from Maxroll, D4Builds, or Icy Veins..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          autoFocus
        />
        <button
          id="import-button"
          className="import-form__button"
          onClick={handleImport}
          disabled={!isValidUrl || isLoading}
        >
          {isLoading ? '⏳ Importing...' : '⚔ Import Build'}
        </button>
      </div>
    </div>
  )
}

export default ImportForm
