import { useState, useEffect } from 'react'

/**
 * UpdateBanner — Handles the complete auto-update frontend lifecycle:
 * - Shows when an update is available with a "Download" button.
 * - Shows download progress when an update is being downloaded.
 * - Shows a "Restart & Install" button once the download completes.
 */
function UpdateBanner(): React.JSX.Element | null {
  const [status, setStatus] = useState<'idle' | 'available' | 'downloading' | 'ready'>('idle')
  const [version, setVersion] = useState<string>('')
  const [progress, setProgress] = useState({ percent: 0, downloadedMB: 0, totalMB: 0 })

  useEffect(() => {
    // Check initial status on mount
    window.api.getUpdateStatus().then(() => {
      // Just in case we need to track it manually, though normally it's handled by events
    })

    const removeAvailable = window.api.onUpdateAvailable((info) => {
      setVersion(info.version || 'New Version')
      setStatus('available')
    })

    const removeStarted = window.api.onUpdateStarted(() => {
      setStatus('downloading')
    })

    const removeProgress = window.api.onUpdateProgress((p) => {
      setStatus('downloading')
      setProgress(p)
    })

    const removeDownloaded = window.api.onUpdateDownloaded(() => {
      setStatus('ready')
    })

    return () => {
      removeAvailable()
      removeStarted()
      removeProgress()
      removeDownloaded()
    }
  }, [])

  const handleDownload = (): void => {
    window.api.downloadUpdate()
  }

  const handleInstall = (): void => {
    window.api.installUpdate()
  }

  if (status === 'idle') return null

  return (
    <div className="update-banner" role="status" aria-live="polite">
      {status === 'available' && (
        <div className="update-banner__content">
          <span className="update-banner__text">✨ Update Available: {version}</span>
          <button className="btn btn--primary btn--sm" onClick={handleDownload}>
            Download
          </button>
        </div>
      )}

      {status === 'downloading' && (
        <>
          <div className="update-banner__progress-track">
            <div
              className="update-banner__progress-fill"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <span className="update-banner__text">
            Downloading update… {progress.percent.toFixed(1)}% ({progress.downloadedMB.toFixed(1)}/
            {progress.totalMB.toFixed(1)} MB)
          </span>
        </>
      )}

      {status === 'ready' && (
        <div className="update-banner__content">
          <span className="update-banner__text">✅ Update downloaded and ready to install.</span>
          <button className="btn btn--success btn--sm" onClick={handleInstall}>
            Restart & Install
          </button>
        </div>
      )}
    </div>
  )
}

export default UpdateBanner
