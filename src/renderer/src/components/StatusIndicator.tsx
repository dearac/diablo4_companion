/**
 * StatusIndicator — Shows the current import state.
 * Idle: hint text. Loading: spinner. Error: red message.
 */

interface StatusIndicatorProps {
  status: 'idle' | 'loading' | 'success' | 'error'
  errorMessage?: string
}

function StatusIndicator({ status, errorMessage }: StatusIndicatorProps): React.JSX.Element | null {
  if (status === 'idle') {
    return (
      <div className="status-indicator status-indicator--idle">
        <p>Paste a build URL from Maxroll, D4Builds, or Icy Veins</p>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="status-indicator status-indicator--loading">
        <div className="spinner" />
        <p>Scraping build data...</p>
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
