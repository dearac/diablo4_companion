import { useEffect, useState } from 'react'
import type { ScanVerdict, ParsedAffix } from '../../shared/types'

/**
 * OverlayApp
 *
 * This component runs in the transparent, click-through overlay window.
 * It listens for 'scan-result' IPC events and draws absolute-positioned
 * geometric shapes over the parsed affixes based on their bounding boxes.
 */
export function OverlayApp(): React.JSX.Element | null {
  const [verdict, setVerdict] = useState<ScanVerdict | null>(null)
  const [displayBounds, setDisplayBounds] = useState<{ x: number; y: number } | null>(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Listen for scan results
    const unsubscribeResult = window.electron.ipcRenderer.on(
      'scan-result',
      (
        _event,
        data: {
          verdict: ScanVerdict | null
          error: string | null
          bounds?: { x: number; y: number }
        }
      ) => {
        if (data.verdict) {
          setVerdict(data.verdict)
          if (data.bounds) {
            setDisplayBounds(data.bounds)
          }
          setShow(true)
        } else {
          setShow(false)
        }
      }
    )

    // Listen for window hide to clear
    const unsubscribeHide = window.electron.ipcRenderer.on('always-on-top-changed', () => {
      setShow(false)
    })

    // Listen for automatic mouse-move dismissal
    const unsubscribeMouseMoveHide = window.electron.ipcRenderer.on('hide-overlay', () => {
      setShow(false)
    })

    return () => {
      unsubscribeResult()
      unsubscribeHide()
      unsubscribeMouseMoveHide()
    }
  }, [])

  if (!show || !verdict) return <div />

  const validXs = verdict.scannedItem.parsedAffixes
    .map((a: ParsedAffix) => a.bbox?.x)
    .filter((n: number | undefined) => typeof n === 'number') as number[]

  // Find the leftmost X coordinate of the MAIN cluster of affixes.
  // This prevents a single false-positive background text from ruining the alignment of all dots.
  let minAffixX: number | undefined = undefined
  if (validXs.length > 0) {
    // Sort the Xs and look for the largest cluster (within a 20px threshold)
    validXs.sort((a, b) => a - b)
    let bestCluster: number[] = []

    for (let i = 0; i < validXs.length; i++) {
      const cluster = [validXs[i]]
      for (let j = i + 1; j < validXs.length; j++) {
        if (validXs[j] - validXs[i] <= 20) {
          cluster.push(validXs[j])
        }
      }
      if (cluster.length > bestCluster.length) {
        bestCluster = cluster
      }
    }

    // Use the minimum of the best cluster
    minAffixX = bestCluster.length > 0 ? Math.min(...bestCluster) : validXs[0]
  }

  return (
    <div style={{ width: '100vw', height: '100vh', pointerEvents: 'none' }}>
      {verdict.scannedItem.parsedAffixes.map((affix: ParsedAffix, index: number) => {
        if (!affix.bbox) return null

        const isExtra = verdict.extraAffixes.includes(affix.text)
        const isImplicit = verdict.scannedItem.implicitAffixes.includes(affix.text)

        // If it's not an implicit affix, and it's not marked as extra, it MUST be a matched requirement!
        // (We do this because verdict.matchedAffixes contains normalized build names, not the raw text)
        const isMatched = !isImplicit && !isExtra

        // Draw a Green Circle if it matches the build, Red if it's unwanted (extra), Yellow for implicits
        const bgColor = isMatched ? '#22c55e' : isExtra ? '#ef4444' : '#eab308'
        const shadowColor = isMatched
          ? 'rgba(34, 197, 94, 0.7)'
          : isExtra
            ? 'rgba(239, 68, 68, 0.7)'
            : 'rgba(234, 179, 8, 0.7)'

        // The OCR bbox is absolute virtual screen coordinates.
        // Subtract the display bounds to convert to window-local coordinates.
        const offsetX = displayBounds?.x || 0
        const offsetY = displayBounds?.y || 0

        // Use the collective minimum X so all markers form a perfect vertical line,
        // eliminating horizontal jitter caused by OCR optionally seeing bullet points.
        const baseX = minAffixX !== undefined ? minAffixX : affix.bbox.x
        const leftPos = baseX - 24 - offsetX

        // Center the marker vertically with the text height
        const topPos = affix.bbox.y + affix.bbox.h / 2 - 8 - offsetY

        return (
          <div
            key={index}
            style={{
              position: 'absolute',
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              border: '2px solid #111827',
              backgroundColor: bgColor,
              left: Math.max(0, leftPos),
              top: Math.max(0, topPos),
              boxShadow: `0 0 10px 2px ${shadowColor}`
            }}
          />
        )
      })}
    </div>
  )
}
