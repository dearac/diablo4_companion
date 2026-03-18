import { useState, useRef, useEffect, useCallback } from 'react'

// ============================================================
// HelpTooltip — Styled hover tooltips with helpful instructions
// ============================================================
// Provides contextual help text when hovering over UI elements.
// Supports configurable placement (top, bottom, left, right)
// and auto-repositions to stay within the viewport.
// ============================================================

type Placement = 'top' | 'bottom' | 'left' | 'right'

interface HelpTooltipProps {
    /** The help text to display */
    text: string
    /** Where to position relative to children (default: top) */
    placement?: Placement
    /** The wrapped element(s) */
    children: React.ReactNode
    /** Optional CSS class for the wrapper */
    className?: string
    /** Max width in pixels (default: 260) */
    maxWidth?: number
}

/**
 * HelpTooltip — Wraps any element(s) and shows an instructional tooltip on hover.
 *
 * Usage:
 *   <HelpTooltip text="Paste a URL from a build site to import gear data">
 *     <input ... />
 *   </HelpTooltip>
 */
function HelpTooltip({
    text,
    placement = 'top',
    children,
    className = '',
    maxWidth = 260
}: HelpTooltipProps): React.JSX.Element {
    const [visible, setVisible] = useState(false)
    const [adjustedPlacement, setAdjustedPlacement] = useState<Placement>(placement)
    const wrapperRef = useRef<HTMLDivElement>(null)
    const tooltipRef = useRef<HTMLDivElement>(null)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    /** Adjust placement if tooltip would overflow viewport */
    const adjustPosition = useCallback((): void => {
        if (!wrapperRef.current || !tooltipRef.current) return

        const wrapperRect = wrapperRef.current.getBoundingClientRect()
        const tooltipRect = tooltipRef.current.getBoundingClientRect()
        const padding = 8

        let best = placement

        if (placement === 'top' && wrapperRect.top - tooltipRect.height - padding < 0) {
            best = 'bottom'
        } else if (placement === 'bottom' && wrapperRect.bottom + tooltipRect.height + padding > window.innerHeight) {
            best = 'top'
        } else if (placement === 'left' && wrapperRect.left - tooltipRect.width - padding < 0) {
            best = 'right'
        } else if (placement === 'right' && wrapperRect.right + tooltipRect.width + padding > window.innerWidth) {
            best = 'left'
        }

        setAdjustedPlacement(best)
    }, [placement])

    useEffect(() => {
        if (visible) adjustPosition()
    }, [visible, adjustPosition])

    const handleMouseEnter = (): void => {
        timerRef.current = setTimeout(() => setVisible(true), 400)
    }

    const handleMouseLeave = (): void => {
        if (timerRef.current) clearTimeout(timerRef.current)
        setVisible(false)
    }

    return (
        <div
            ref={wrapperRef}
            className={`help-tooltip-wrapper ${className}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {children}
            {visible && (
                <div
                    ref={tooltipRef}
                    className={`help-tooltip help-tooltip--${adjustedPlacement}`}
                    style={{ maxWidth: `${maxWidth}px` }}
                    role="tooltip"
                >
                    <span className="help-tooltip__icon">💡</span>
                    <span className="help-tooltip__text">{text}</span>
                    <div className={`help-tooltip__arrow help-tooltip__arrow--${adjustedPlacement}`} />
                </div>
            )}
        </div>
    )
}

export default HelpTooltip
