import type { IParagonNode } from '../types'
import { NODE_TYPE_CONFIG, formatNodeName } from './paragonNodeUtils'

interface ParagonTooltipProps {
  node: IParagonNode
  visible: boolean
  x: number
  y: number
}

/**
 * ParagonTooltip — Rich, Diablo-themed tooltip that appears on hover
 * over paragon board nodes. Matches d4builds.gg tooltip styling.
 *
 * Features:
 *   - Color-coded header by node type (normal/magic/rare/legendary/gate)
 *   - Node name in accent color
 *   - Description/stat text
 *   - Allocated status badge
 *   - Positioned near cursor, clamped to viewport
 *   - Animated fade-in
 */
function ParagonTooltip({ node, visible, x, y }: ParagonTooltipProps): React.JSX.Element | null {
  if (!visible) return null

  const config = NODE_TYPE_CONFIG[node.nodeType]
  const displayName = formatNodeName(node.nodeName)

  // Offset tooltip 14px from cursor, clamp to stay in viewport
  const tooltipWidth = 240
  const tooltipHeight = 100
  const offsetX = 14
  const offsetY = 14

  // Position to the right and below cursor by default,
  // flip if near viewport edges
  let left = x + offsetX
  let top = y + offsetY

  if (typeof window !== 'undefined') {
    if (left + tooltipWidth > window.innerWidth - 10) {
      left = x - tooltipWidth - offsetX
    }
    if (top + tooltipHeight > window.innerHeight - 10) {
      top = y - tooltipHeight - offsetY
    }
    if (left < 10) left = 10
    if (top < 10) top = 10
  }

  return (
    <div
      className="paragon-tooltip"
      style={{
        left: `${left}px`,
        top: `${top}px`
      }}
    >
      {/* Header — type icon + label */}
      <div className="paragon-tooltip__header">
        <span className="paragon-tooltip__type-icon" style={{ color: config.color }}>
          {config.icon}
        </span>
        <span className="paragon-tooltip__type-label" style={{ color: config.color }}>
          {config.label}
        </span>
      </div>
      {/* Node name */}
      <div className="paragon-tooltip__name">{displayName}</div>
      {/* Description / stat text — may contain multiple lines */}
      {node.nodeDescription && (
        <div className="paragon-tooltip__desc">
          {node.nodeDescription.split('\n').map((line, i) => (
            <div key={i} className="paragon-tooltip__desc-line">
              {line}
            </div>
          ))}
        </div>
      )}{' '}
      {/* Allocated badge */}
      <div
        className="paragon-tooltip__status"
        style={{
          color: node.allocated ? '#4aaf5a' : '#7a7068'
        }}
      >
        {node.allocated ? '✓ Allocated' : '○ Not Allocated'}
      </div>
    </div>
  )
}

export default ParagonTooltip
