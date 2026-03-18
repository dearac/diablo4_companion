import { useState, useRef, useCallback, useEffect } from 'react'

// ============================================================
// useCanvasTransform — Zoom/Pan interaction hook
// ============================================================
// Manages the transform state for a zoomable, pannable canvas.
//
// Features:
//   - Mouse wheel zoom toward cursor (point stays fixed)
//   - Click-drag panning
//   - Fit-all-content reset
//   - Returns a CSS transform string for the canvas layer
//
// ARCHITECTURE NOTE — Refs vs State:
//   Scale and offset are kept in BOTH refs and state. The refs
//   are the synchronous source of truth — they're updated
//   immediately in the wheel handler so rapid consecutive events
//   always read the latest values. The state is then set from
//   the ref to trigger a React re-render. This eliminates cursor
//   drift during fast scrolling.
//
// PERFORMANCE NOTE — RAF Throttling:
//   Rapid mouse events (wheel, mousemove) fire faster than the
//   screen refreshes. We update refs immediately for accuracy,
//   but batch React state updates through requestAnimationFrame
//   so we never re-render more than once per frame (~60fps).
//   This prevents re-rendering 3,000+ DOM nodes hundreds of
//   times per second during rapid scrolling/panning.
// ============================================================

/** Minimum zoom level — see all boards from far away */
const MIN_ZOOM = 0.08

/** Maximum zoom level — inspect individual nodes */
const MAX_ZOOM = 2.5

/** Default zoom to show a comfortable overview */
const DEFAULT_ZOOM = 0.35

/**
 * Zoom sensitivity — how fast the mouse wheel zooms.
 * Lower = finer control (easier to target individual nodes).
 * At 0.001, each wheel tick (deltaY=120) changes zoom by ~12%.
 */
const ZOOM_SENSITIVITY = 0.001

/**
 * World bounds — the bounding box of all content on the canvas.
 * Used by `fitAll()` to center and scale the view.
 */
export interface WorldBounds {
  minX: number
  minY: number
  width: number
  height: number
}

/**
 * Return type of the useCanvasTransform hook.
 */
export interface CanvasTransformResult {
  /** Current zoom scale (0.08 to 2.5) */
  scale: number
  /** Current offset in pixels */
  offset: { x: number; y: number }
  /** Ref to attach to the container div for event handling */
  containerRef: React.RefObject<HTMLDivElement | null>
  /** CSS transform string for the world layer: "translate(Xpx, Ypx) scale(S)" */
  transformStyle: string
  /** Mouse down handler — starts panning */
  handleMouseDown: (e: React.MouseEvent) => void
  /** Mouse move handler — continues panning */
  handleMouseMove: (e: React.MouseEvent) => void
  /** Mouse up handler — ends panning */
  handleMouseUp: () => void
  /** Whether the user is currently panning (show grab cursor) */
  isPanning: boolean
  /** Reset view to fit all content */
  fitAll: (bounds: WorldBounds) => void
  /** Zoom in by a fixed step */
  zoomIn: () => void
  /** Zoom out by a fixed step */
  zoomOut: () => void
  /** Zoom percentage for display (e.g. "42%") */
  zoomPercent: string
}

/**
 * useCanvasTransform — Hook for interactive zoom and pan.
 *
 * Attach `containerRef` to the container element. The wheel handler
 * is auto-registered with { passive: false }. Apply `transformStyle`
 * to the inner "world" div that holds all the boards.
 *
 * Zoom-to-cursor math:
 *   When zooming, the point under the cursor should stay fixed.
 *   This means adjusting the offset so that:
 *     cursorWorld = (cursorScreen - offset) / scale
 *   remains constant before and after the zoom.
 */
export function useCanvasTransform(): CanvasTransformResult {
  // React state — drives re-renders
  const [scale, setScale] = useState(DEFAULT_ZOOM)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)

  // Refs — synchronous source of truth for rapid event handling.
  // These are always up-to-date, unlike state which lags by one
  // render cycle during batched updates.
  const scaleRef = useRef(DEFAULT_ZOOM)
  const offsetRef = useRef({ x: 0, y: 0 })

  const panStart = useRef({ x: 0, y: 0 })
  const offsetAtPanStart = useRef({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement | null>(null)

  // RAF throttle flag — prevents scheduling multiple frames
  const rafPending = useRef(false)

  /**
   * Flushes the current ref values into React state, capped at
   * one re-render per animation frame. Multiple rapid events
   * (wheel ticks, mousemove) only trigger a single setState.
   */
  const scheduleRender = useCallback(() => {
    if (rafPending.current) return
    rafPending.current = true
    requestAnimationFrame(() => {
      rafPending.current = false
      setScale(scaleRef.current)
      setOffset({ ...offsetRef.current })
    })
  }, [])

  /**
   * handleWheel — Zooms toward the cursor position.
   *
   * Uses refs to read the latest scale/offset synchronously,
   * then writes to both the ref (immediate) and schedules a
   * render via RAF. This ensures every wheel tick — even when
   * they fire faster than React can re-render — uses perfectly
   * accurate values, while only rendering once per frame.
   *
   * Registered via addEventListener with { passive: false } so
   * preventDefault() actually blocks page scroll.
   */
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      // Cursor position relative to the container
      const cursorX = e.clientX - rect.left
      const cursorY = e.clientY - rect.top

      // Read the CURRENT values synchronously from refs
      const prevScale = scaleRef.current
      const prevOffset = offsetRef.current

      // Compute new scale
      const zoomFactor = 1 - e.deltaY * ZOOM_SENSITIVITY
      const newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevScale * zoomFactor))
      const ratio = newScale / prevScale

      // Adjust offset so the world-space point under the cursor
      // remains at the same screen position after zooming.
      // Formula: newOffset = cursor - (cursor - oldOffset) * ratio
      const newOffset = {
        x: cursorX - (cursorX - prevOffset.x) * ratio,
        y: cursorY - (cursorY - prevOffset.y) * ratio
      }

      // Write to refs FIRST (synchronous, immediate)
      scaleRef.current = newScale
      offsetRef.current = newOffset

      // Schedule a batched render (max once per frame)
      scheduleRender()
    },
    [scheduleRender]
  ) // No state dependencies — reads from refs

  // Register wheel handler with { passive: false } so preventDefault works.
  // React's onWheel is passive — it CANNOT prevent scrolling.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  /** handleMouseDown — Begins a pan drag operation */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only pan on left-click or middle-click
    if (e.button !== 0 && e.button !== 1) return

    setIsPanning(true)
    panStart.current = { x: e.clientX, y: e.clientY }
    offsetAtPanStart.current = { ...offsetRef.current }
  }, [])

  /** handleMouseMove — Continues panning while dragging */
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning) return

      const dx = e.clientX - panStart.current.x
      const dy = e.clientY - panStart.current.y

      const newOffset = {
        x: offsetAtPanStart.current.x + dx,
        y: offsetAtPanStart.current.y + dy
      }

      // Keep refs in sync during panning too
      offsetRef.current = newOffset

      // Batch pan updates via RAF (mousemove fires 60+fps)
      scheduleRender()
    },
    [isPanning, scheduleRender]
  )

  /** handleMouseUp — Ends the pan drag */
  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  /**
   * fitAll — Resets the view to fit all content within the container.
   * Centers the world bounds in the viewport with some padding.
   */
  const fitAll = useCallback((bounds: WorldBounds) => {
    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const padding = 40 // px padding around the content

    const scaleX = (rect.width - padding * 2) / bounds.width
    const scaleY = (rect.height - padding * 2) / bounds.height
    const fitScale = Math.min(scaleX, scaleY, MAX_ZOOM)

    // Center the content
    const centerX = bounds.minX + bounds.width / 2
    const centerY = bounds.minY + bounds.height / 2

    const newOffset = {
      x: rect.width / 2 - centerX * fitScale,
      y: rect.height / 2 - centerY * fitScale
    }

    // Update both refs and state (immediate for fitAll — user expects instant response)
    scaleRef.current = fitScale
    offsetRef.current = newOffset
    setScale(fitScale)
    setOffset(newOffset)
  }, [])

  /** Zoom in by a 25% step, centered on the viewport */
  const zoomIn = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2

    const prevScale = scaleRef.current
    const prevOffset = offsetRef.current
    const newScale = Math.min(MAX_ZOOM, prevScale * 1.25)
    const ratio = newScale / prevScale
    const newOffset = {
      x: cx - (cx - prevOffset.x) * ratio,
      y: cy - (cy - prevOffset.y) * ratio
    }

    scaleRef.current = newScale
    offsetRef.current = newOffset
    setScale(newScale)
    setOffset(newOffset)
  }, [])

  /** Zoom out by a 25% step, centered on the viewport */
  const zoomOut = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2

    const prevScale = scaleRef.current
    const prevOffset = offsetRef.current
    const newScale = Math.max(MIN_ZOOM, prevScale * 0.8)
    const ratio = newScale / prevScale
    const newOffset = {
      x: cx - (cx - prevOffset.x) * ratio,
      y: cy - (cy - prevOffset.y) * ratio
    }

    scaleRef.current = newScale
    offsetRef.current = newOffset
    setScale(newScale)
    setOffset(newOffset)
  }, [])

  // Release panning if mouse leaves the window entirely
  useEffect(() => {
    const handleGlobalUp = (): void => setIsPanning(false)
    window.addEventListener('mouseup', handleGlobalUp)
    return () => window.removeEventListener('mouseup', handleGlobalUp)
  }, [])

  const transformStyle = `translate(${offset.x}px, ${offset.y}px) scale(${scale})`
  const zoomPercent = `${Math.round(scale * 100)}%`

  return {
    scale,
    offset,
    containerRef,
    transformStyle,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    isPanning,
    fitAll,
    zoomIn,
    zoomOut,
    zoomPercent
  }
}
