import type { RawBuildData } from '../../../shared/types'

/**
 * BuildSummaryCard — Displays a successful import result.
 * Shows the build name, class, and counts for skills/paragon/gear.
 */

interface BuildSummaryCardProps {
  build: RawBuildData
  onLaunchOverlay: () => void
}

function BuildSummaryCard({ build, onLaunchOverlay }: BuildSummaryCardProps): React.JSX.Element {
  /** Count total allocated paragon nodes across all boards */
  const totalNodes = build.paragonBoards.reduce(
    (sum, board) => sum + board.allocatedNodes.filter((n) => n.allocated).length,
    0
  )

  /** Count boards with glyphs */
  const glyphCount = build.paragonBoards.filter((b) => b.glyph !== null).length

  return (
    <div className="build-summary">
      <h2 className="build-summary__name">⚔ {build.name}</h2>
      <div className="build-summary__divider" />
      <div className="build-summary__meta">
        <div className="build-summary__stat">
          <span className="build-summary__label">Class</span>
          <span className="build-summary__value">{build.d4Class}</span>
        </div>
        <div className="build-summary__stat">
          <span className="build-summary__label">Level</span>
          <span className="build-summary__value">{build.level}</span>
        </div>
        <div className="build-summary__stat">
          <span className="build-summary__label">Skills</span>
          <span className="build-summary__value">{build.skills.length} allocated</span>
        </div>
        <div className="build-summary__stat">
          <span className="build-summary__label">Paragon</span>
          <span className="build-summary__value">
            {build.paragonBoards.length} boards, {glyphCount} glyphs
          </span>
        </div>
        <div className="build-summary__stat">
          <span className="build-summary__label">Gear</span>
          <span className="build-summary__value">{build.gearSlots.length} slots</span>
        </div>
      </div>

      <button id="launch-overlay-button" className="launch-button" onClick={onLaunchOverlay}>
        🗡️ Launch Overlay
      </button>
    </div>
  )
}

export default BuildSummaryCard
