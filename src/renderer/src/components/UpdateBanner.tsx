import { useState, useEffect } from 'react'

/**
 * UpdateBanner — Shows download progress when an update is being downloaded.
 * Appears at the top of the config window as a slim progress bar with text.
 * Hidden when no update is in progress.
 */
function UpdateBanner(): React.JSX.Element | null {
    const [isUpdating, setIsUpdating] = useState(false)
    const [progress, setProgress] = useState({ percent: 0, downloadedMB: 0, totalMB: 0 })

    useEffect(() => {
        window.api.onUpdateStarted(() => {
            setIsUpdating(true)
        })

        window.api.onUpdateProgress((p) => {
            setProgress(p)
        })
    }, [])

    if (!isUpdating) return null

    return (
        <div className="update-banner" role="status" aria-live="polite">
            <div className="update-banner__progress-track">
                <div
                    className="update-banner__progress-fill"
                    style={{ width: `${progress.percent}%` }}
                />
            </div>
            <span className="update-banner__text">
                Downloading update… {progress.percent}% ({progress.downloadedMB}/{progress.totalMB} MB)
            </span>
        </div>
    )
}

export default UpdateBanner
