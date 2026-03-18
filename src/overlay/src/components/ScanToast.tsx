import { useState, useEffect, useCallback } from 'react'
import type { IScannedItem, IInventoryVerdict, IGearVerdict } from '../../../shared/types'

// ============================================================
// Types
// ============================================================

interface ScanToastEntry {
    id: number
    item?: IScannedItem
    verdict?: IInventoryVerdict
    equipVerdict?: IGearVerdict
    mode: 'equip' | 'inventory'
    error?: string
    timestamp: number
}

interface ScanToastProps {
    /** How long each toast stays visible (ms) */
    duration?: number
}

// ============================================================
// ScanToast Component
// ============================================================

/**
 * ScanToast — Animated notification that appears after each OCR scan.
 *
 * Shows a brief summary of the scan result:
 *   - Item name, slot, and rarity
 *   - Quick verdict (✅ / ❌ / ⬆️)
 *   - Auto-dismisses after a configurable duration
 *   - Stackable for rapid scanning sessions
 *
 * Listens for 'scan-result' IPC events from the main process.
 */
let toastCounter = 0

function ScanToast({ duration = 5000 }: ScanToastProps): React.JSX.Element {
    const [toasts, setToasts] = useState<ScanToastEntry[]>([])

    const addToast = useCallback((entry: Omit<ScanToastEntry, 'id' | 'timestamp'>) => {
        const id = ++toastCounter
        const newToast: ScanToastEntry = {
            ...entry,
            id,
            timestamp: Date.now()
        }

        setToasts(prev => [...prev, newToast])

        // Auto-dismiss after duration
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id))
        }, duration)
    }, [duration])

    // Listen for scan results from the main process
    useEffect(() => {
        const handleScanResult = (_event: unknown, data: {
            mode: 'equip' | 'inventory'
            item?: IScannedItem
            verdict?: IInventoryVerdict
            equipVerdict?: IGearVerdict
            error?: string
        }): void => {
            addToast({
                mode: data.mode,
                item: data.item,
                verdict: data.verdict,
                equipVerdict: data.equipVerdict,
                error: data.error
            })
        }

        // Register IPC listener
        if (window.electron?.ipcRenderer) {
            window.electron.ipcRenderer.on('scan-result', handleScanResult)
        }

        return () => {
            if (window.electron?.ipcRenderer) {
                window.electron.ipcRenderer.removeAllListeners('scan-result')
            }
        }
    }, [addToast])

    if (toasts.length === 0) return <></>

    return (
        <div className="scan-toast-container">
            {toasts.map(toast => (
                <div
                    key={toast.id}
                    className={`scan-toast scan-toast--${toast.error ? 'error' : toast.mode}`}
                >
                    {toast.error ? (
                        <div className="scan-toast__error">
                            <span className="scan-toast__icon">❌</span>
                            <span className="scan-toast__text">{toast.error}</span>
                        </div>
                    ) : toast.mode === 'equip' && toast.item ? (
                        <div className="scan-toast__content">
                            <span className="scan-toast__icon">✅</span>
                            <div className="scan-toast__details">
                                <div className="scan-toast__item-name">{toast.item.itemName}</div>
                                <div className="scan-toast__slot">
                                    Equipped → {toast.item.slot}
                                    <span className={`scan-toast__rarity scan-toast__rarity--${toast.item.itemType.toLowerCase()}`}>
                                        {toast.item.itemType}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ) : toast.verdict ? (
                        <div className="scan-toast__content">
                            <span className="scan-toast__icon">
                                {toast.verdict.recommendation === 'EQUIP' ? '⬆️' :
                                    toast.verdict.recommendation === 'SALVAGE' ? '🔨' :
                                        toast.verdict.recommendation === 'KEEP_FOR_TEMPER' ? '⚒️' : '↔️'}
                            </span>
                            <div className="scan-toast__details">
                                <div className="scan-toast__item-name">
                                    {toast.verdict.scannedItem.itemName}
                                </div>
                                <div className="scan-toast__verdict">
                                    <span className={`scan-toast__recommendation scan-toast__recommendation--${toast.verdict.recommendation.toLowerCase()}`}>
                                        {toast.verdict.recommendation}
                                    </span>
                                    {toast.verdict.gainsOverEquipped.length > 0 && (
                                        <span className="scan-toast__gains">
                                            +{toast.verdict.gainsOverEquipped.length} new
                                        </span>
                                    )}
                                    {toast.verdict.lossesFromEquipped.length > 0 && (
                                        <span className="scan-toast__losses">
                                            -{toast.verdict.lossesFromEquipped.length} lost
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : null}

                    <button
                        className="scan-toast__dismiss"
                        onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                    >
                        ×
                    </button>
                </div>
            ))}
        </div>
    )
}

export default ScanToast
