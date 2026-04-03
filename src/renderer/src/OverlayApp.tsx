import { useEffect, useState } from 'react'
import type { ScanVerdict, ParsedAffix } from '../../shared/types'

/**
 * OverlayApp
 *
 * This component runs in the transparent, click-through overlay window.
 * It listens for 'scan-result' IPC events and draws absolute-positioned
 * geometric shapes over the parsed affixes based on their bounding boxes.
 */
export function OverlayApp() {
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

          // Auto-hide the shapes after 6 seconds
          setTimeout(() => {
            setShow(false)
          }, 6000)
        }
      }
    )

    // Listen for window hide to clear
    const unsubscribeHide = window.electron.ipcRenderer.on('always-on-top-changed', () => {
      setShow(false)
    })

    return () => {
      unsubscribeResult()
      unsubscribeHide()
    }
  }, [])

  if (!show || !verdict) return <div />

  const validXs = verdict.scannedItem.parsedAffixes
    .map((a: ParsedAffix) => a.bbox?.x)
    .filter((n: number | undefined) => typeof n === 'number') as number[]

  // Find the leftmost X coordinate of all affixes so they form a perfect vertical column
  const minAffixX = validXs.length > 0 ? Math.min(...validXs) : undefined

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
