import type { IParagonBoard } from '../../../shared/types'
import ParagonBoardCanvas from './ParagonBoardCanvas'

// ============================================================
// ParagonPanel — Paragon board viewer
// ============================================================
// Renders the interactive paragon board canvas with zoom/pan.
// All visual logic is handled by ParagonBoardCanvas; this is
// now just a thin wrapper that receives the boards prop.
// ============================================================

interface ParagonPanelProps {
  boards: IParagonBoard[]
  onDetach?: (boardIndex: number) => void
}

/**
 * ParagonPanel — Renders the interactive paragon board canvas.
 *
 * Previously rendered boards as a vertical scrolling list.
 * Now delegates to ParagonBoardCanvas for a unified, interactive
 * map with zoom-to-cursor and click-drag pan.
 */
function ParagonPanel({ boards, onDetach }: ParagonPanelProps): React.JSX.Element {
  return (
    <div className="paragon-panel">
      <ParagonBoardCanvas boards={boards} onDetach={onDetach} />
    </div>
  )
}

export default ParagonPanel
