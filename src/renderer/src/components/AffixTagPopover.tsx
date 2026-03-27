import { useState, useRef, useEffect } from 'react'
import type { AffixType } from '../../../shared/types'

interface AffixTagPopoverProps {
  affixText: string
  currentType: AffixType
  matchStatus: 'match' | 'miss' | 'reroll'
  onTag: (newType: AffixType) => void
}

const TAG_OPTIONS: { type: AffixType; label: string; icon: string; color: string }[] = [
  { type: 'greater', label: 'Greater', icon: '⭐', color: 'var(--item-greater)' },
  { type: 'tempered', label: 'Tempered', icon: '⚒️', color: 'var(--item-tempered)' },
  { type: 'regular', label: 'Rerolled', icon: '🔧', color: 'var(--item-rare)' },
  { type: 'implicit', label: 'Masterworked', icon: '👑', color: 'var(--item-unique)' }
]

const TYPE_COLORS: Record<AffixType, string> = {
  regular: 'var(--text-muted)',
  tempered: 'var(--item-tempered)',
  greater: 'var(--item-greater)',
  implicit: 'var(--item-unique)'
}

const TYPE_LABELS: Record<AffixType, string> = {
  regular: 'Regular',
  tempered: 'Tempered',
  greater: 'Greater',
  implicit: 'Implicit'
}

const MATCH_ICONS: Record<string, string> = {
  match: '✅',
  miss: '❌',
  reroll: '🔧'
}

function AffixTagPopover({ affixText, currentType, matchStatus, onTag }: AffixTagPopoverProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  const handleTagSelect = (type: AffixType): void => {
    onTag(type)
    setIsOpen(false)
  }

  const pillColor = TYPE_COLORS[currentType]
  const pillLabel = TYPE_LABELS[currentType]

  return (
    <div className="affix-tag-row" ref={containerRef}>
      {/* Match status icon */}
      <span className="affix-tag-row__match-icon">{MATCH_ICONS[matchStatus]}</span>

      {/* Affix text */}
      <span className="affix-tag-row__text">{affixText}</span>

      {/* Clickable tag pill */}
      <button
        className="affix-tag-pill"
        style={{ color: pillColor, borderColor: pillColor }}
        onClick={() => setIsOpen(!isOpen)}
        title="Click to reclassify this affix"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        {pillLabel}
      </button>

      {/* Popover */}
      {isOpen && (
        <div className="affix-tag-popover" role="listbox" aria-label="Reclassify affix">
          <div className="affix-tag-popover__label">Reclassify as:</div>
          {TAG_OPTIONS.map((opt) => (
            <button
              key={opt.type}
              className={`affix-tag-btn ${currentType === opt.type ? 'affix-tag-btn--active' : ''}`}
              style={{ '--tag-color': opt.color } as React.CSSProperties}
              onClick={() => handleTagSelect(opt.type)}
              role="option"
              aria-selected={currentType === opt.type}
            >
              <span className="affix-tag-btn__icon">{opt.icon}</span>
              <span className="affix-tag-btn__label">{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default AffixTagPopover
