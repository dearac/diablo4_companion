import { useState, useEffect, useCallback } from 'react'

// ============================================================
// StatusBanner — Install Progress + OCR Service Status
// ============================================================
// Two-mode component:
//   1. Installing: Progress bar with step text during bootstrap
//   2. Service: Scrolling message log showing OCR scan activity
//
// Always visible at the top of the config window.
// Messages persist until the user dismisses them.
// ============================================================

interface StatusMessage {
    id: string
    type: 'ready' | 'scanning' | 'success' | 'error'
    text: string
    timestamp: string
}

type BannerMode = 'installing' | 'service'

const MAX_MESSAGES = 5

/** Format a Date into a compact time string like "2:14 PM" */
function formatTime(isoString: string): string {
    return new Date(isoString).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit'
    })
}

/** Map message type to a status icon */
function getIcon(type: StatusMessage['type']): string {
    switch (type) {
        case 'ready':
            return '\u{1F7E2}' // 🟢
        case 'scanning':
            return '\u23F3' // ⏳
        case 'success':
            return '\u2713' // ✓
        case 'error':
            return '\u{1F534}' // 🔴
    }
}

/**
 * StatusBanner — Shows bootstrap install progress, then live OCR status.
 *
 * Listens for:
 *   - `python-bootstrap-progress` events during first-run setup
 *   - `ocr-status` events during OCR scans
 */
function StatusBanner(): React.JSX.Element {
    const [mode, setMode] = useState<BannerMode>('installing')
    const [installStage, setInstallStage] = useState('checking')
    const [installMessage, setInstallMessage] = useState('Checking OCR environment\u2026')
    const [installPercent, setInstallPercent] = useState<number | undefined>(undefined)
    const [messages, setMessages] = useState<StatusMessage[]>([])

    /** Add a message to the log (newest first, max 5) */
    const addMessage = useCallback((type: StatusMessage['type'], text: string): void => {
        const msg: StatusMessage = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type,
            text,
            timestamp: new Date().toISOString()
        }
        setMessages((prev) => [msg, ...prev].slice(0, MAX_MESSAGES))
    }, [])

    /** Dismiss a single message by ID */
    const dismissMessage = useCallback((id: string): void => {
        setMessages((prev) => prev.filter((m) => m.id !== id))
    }, [])

    /** Clear all messages */
    const clearAll = useCallback((): void => {
        setMessages([])
    }, [])

    // ---- Bootstrap Progress Listener ----
    useEffect(() => {
        // Query current bootstrap status to handle race condition
        // (bootstrap may have already completed before this component mounted)
        window.api.getBootstrapStatus().then((status) => {
            if (status.stage === 'ready') {
                setMode('service')
                addMessage('ready', 'OCR Ready')
            } else if (status.stage === 'error') {
                setMode('service')
                addMessage('error', status.message)
            } else {
                setInstallStage(status.stage)
                setInstallMessage(status.message)
                if (status.percent !== undefined) setInstallPercent(status.percent)
            }
        })

        // Listen for subsequent bootstrap progress events
        window.api.onBootstrapProgress((progress) => {
            if (progress.stage === 'ready') {
                setMode('service')
                addMessage('ready', 'OCR Ready')
                return
            }

            if (progress.stage === 'error') {
                setMode('service')
                addMessage('error', progress.message)
                return
            }

            // Still installing — update progress display
            setMode('installing')
            setInstallStage(progress.stage)
            setInstallMessage(progress.message)
            setInstallPercent(progress.percent)
        })

        window.api.onOcrStatus((status) => {
            const type = status.type as StatusMessage['type']
            addMessage(type === 'scanning' ? 'scanning' : type === 'success' ? 'success' : 'error', status.message)
        })
    }, [addMessage])

    // ---- Install Mode ----
    if (mode === 'installing') {
        // Map stages to an overall progress percentage
        const stageProgress: Record<string, number> = {
            checking: 0,
            'downloading-python': 15,
            extracting: 35,
            configuring: 45,
            'installing-pip': 55,
            'installing-deps': 70,
            'downloading-tesseract': 80,
            'installing-tesseract': 95,
            ready: 100
        }

        const overallPercent = installPercent ?? stageProgress[installStage] ?? 0

        return (
            <div className="status-banner status-banner--installing" role="status" aria-live="polite">
                <div className="status-banner__progress-track">
                    <div
                        className="status-banner__progress-fill"
                        style={{ width: `${overallPercent}%` }}
                    />
                </div>
                <span className="status-banner__install-text">
                    {installMessage}
                </span>
            </div>
        )
    }

    // ---- Service Mode ----
    return (
        <div className="status-banner status-banner--service" role="log" aria-live="polite">
            {messages.length === 0 && (
                <div className="status-banner__empty">
                    <span className="status-banner__icon">{getIcon('ready')}</span>
                    <span className="status-banner__text">OCR Ready</span>
                </div>
            )}

            {messages.length > 0 && (
                <div className="status-banner__log">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`status-banner__message status-banner__message--${msg.type}`}>
                            <span className="status-banner__icon">{getIcon(msg.type)}</span>
                            <span className="status-banner__text">{msg.text}</span>
                            <span className="status-banner__time">{formatTime(msg.timestamp)}</span>
                            <button
                                className="status-banner__dismiss"
                                onClick={() => dismissMessage(msg.id)}
                                title="Dismiss"
                                aria-label={`Dismiss: ${msg.text}`}
                            >
                                \u2715
                            </button>
                        </div>
                    ))}

                    {messages.length >= 2 && (
                        <button
                            className="status-banner__clear-all"
                            onClick={clearAll}
                        >
                            Clear All
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}

export default StatusBanner
