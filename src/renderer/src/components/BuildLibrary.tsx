import { useState, useEffect } from 'react'
import type { SavedBuild, RawBuildData } from '../../../shared/types'
import HelpTooltip from './HelpTooltip'

interface BuildLibraryProps {
  onLoadBuild: (data: RawBuildData) => void
  refreshTrigger: number
}

/**
 * BuildLibrary — Shows a list of saved builds.
 * The user can load any build into the overlay or delete unwanted ones.
 */
function BuildLibrary({ onLoadBuild, refreshTrigger }: BuildLibraryProps): React.JSX.Element {
  const [builds, setBuilds] = useState<SavedBuild[]>([])

  /** Fetch builds on mount and whenever refreshTrigger changes */
  useEffect(() => {
    window.api.listBuilds().then(setBuilds).catch(console.error)
  }, [refreshTrigger])

  /** Load a build and pass it up */
  const handleLoad = async (build: SavedBuild): Promise<void> => {
    try {
      await window.api.loadBuild(build.id)
      onLoadBuild(build.data)
    } catch (err) {
      console.error('Failed to load build:', err)
    }
  }

  /** Delete a build and refresh the list */
  const handleDelete = async (id: string): Promise<void> => {
    try {
      await window.api.deleteBuild(id)
      setBuilds((prev) => prev.filter((b) => b.id !== id))
    } catch (err) {
      console.error('Failed to delete build:', err)
    }
  }

  if (builds.length === 0) {
    return (
      <div className="build-library build-library--empty">
        <p>No saved builds yet. Import one above!</p>
      </div>
    )
  }

  return (
    <div className="build-library">
      <HelpTooltip text="Your saved builds. Click ▶ to load one into the overlay, or ✕ to delete it." placement="bottom">
        <h3 className="build-library__title">Saved Builds</h3>
      </HelpTooltip>
      <ul className="build-library__list">
        {builds.map((build) => (
          <li key={build.id} className="build-library__item">
            <div className="build-library__info">
              <span className="build-library__name">{build.data.name}</span>
              <span className="build-library__meta">
                {build.data.d4Class} · {build.sourceSite} ·{' '}
                {new Date(build.importedAt).toLocaleDateString()}
              </span>
            </div>
            <div className="build-library__actions">
              <button
                className="build-library__load-btn"
                onClick={() => handleLoad(build)}
                title="Load this build"
              >
                ▶
              </button>
              <button
                className="build-library__delete-btn"
                onClick={() => handleDelete(build.id)}
                title="Delete this build"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default BuildLibrary
