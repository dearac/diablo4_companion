import { useState } from 'react'
import type { RawBuildData } from '../../../shared/types'
import HelpTooltip from './HelpTooltip'

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
        <HelpTooltip text="Paste a full build URL from Maxroll.gg, D4Builds.gg, or Icy-Veins.com. The app will scrape all skills, gear, and paragon data." placement="bottom" className="help-tooltip-wrapper--block">
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
        </HelpTooltip>
      </div>
      <HelpTooltip text="Scrapes the build page and saves all skills, paragon boards, gear, and runes. You can then view them in the overlay." placement="bottom">
        <button
          id="import-button"
          className="import-form__button"
          onClick={handleImport}
          disabled={!isValidUrl || isLoading}
        >
          {isLoading ? '⏳ Importing...' : '⚔ Import Build'}
        </button>
      </HelpTooltip>
    </div>
  )
}

export default ImportForm
