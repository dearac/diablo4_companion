/**
 * StatusIndicator — Shows the current import state.
 * Idle: hint text. Loading: progress bar + step label. Error: red message.
 */

interface StatusIndicatorProps {
  status: 'idle' | 'loading' | 'success' | 'error'
  errorMessage?: string
  progress?: { step: number; totalSteps: number; label: string } | null
}

function StatusIndicator({
  status,
  errorMessage,
  progress
}: StatusIndicatorProps): React.JSX.Element | null {
  if (status === 'idle') {
    return (
      <div className="status-indicator status-indicator--idle">
        <p>Paste a build URL from Maxroll, D4Builds, or Icy Veins</p>
      </div>
    )
  }

  if (status === 'loading') {
    const percent = progress ? Math.round((progress.step / progress.totalSteps) * 100) : 0

    return (
      <div className="status-indicator status-indicator--loading">
        <p>{progress?.label || 'Preparing import...'}</p>
        <div className="import-progress">
          <div className="import-progress__bar">
            <div className="import-progress__fill" style={{ width: `${percent}%` }} />
          </div>
          <span className="import-progress__text">
            Step {progress?.step || 0} of {progress?.totalSteps || 0}
          </span>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="status-indicator status-indicator--error">
        <p>⚠ {errorMessage || 'Import failed'}</p>
      </div>
    )
  }

  // 'success' — handled by BuildSummaryCard, nothing here
  return null
}

export default StatusIndicator
