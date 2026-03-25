import { useState } from 'react'
import type { ScannedGearPiece, IGearSlot, AffixType, ScanVerdict } from '../../../shared/types'
import { compareGear } from '../../../shared/GearComparer'

interface AffixEditorProps {
  item: ScannedGearPiece
  buildSlot: IGearSlot | null
  onSave: (updated: ScannedGearPiece, newVerdict: ScanVerdict | null) => void
  onCancel: () => void
}

interface EditableAffix {
  text: string
  type: AffixType
}

/**
 * AffixEditor — Inline editor for scanned gear affixes.
 *
 * Lets users rename, reclassify, add, and remove affixes.
 * Provides a live preview of the match score before saving.
 */
function AffixEditor({ item, buildSlot, onSave, onCancel }: AffixEditorProps): React.JSX.Element {
  // Build flat editable list from all affix pools
  const buildInitialAffixes = (): EditableAffix[] => {
    const affixes: EditableAffix[] = []
    for (const a of item.affixes) affixes.push({ text: a, type: 'regular' })
    for (const a of item.temperedAffixes) affixes.push({ text: a, type: 'tempered' })
    for (const a of item.greaterAffixes) affixes.push({ text: a, type: 'greater' })
    for (const a of item.implicitAffixes) affixes.push({ text: a, type: 'implicit' })
    return affixes
  }

  const [affixes, setAffixes] = useState<EditableAffix[]>(buildInitialAffixes)
  const [sockets, setSockets] = useState(item.sockets)
  const [aspectName, setAspectName] = useState(item.aspect?.name ?? '')

  const handleTextChange = (index: number, text: string): void => {
    setAffixes((prev) => prev.map((a, i) => (i === index ? { ...a, text } : a)))
  }

  const handleTypeChange = (index: number, type: AffixType): void => {
    setAffixes((prev) => prev.map((a, i) => (i === index ? { ...a, type } : a)))
  }

  const handleRemove = (index: number): void => {
    setAffixes((prev) => prev.filter((_, i) => i !== index))
  }

  const handleAdd = (): void => {
    setAffixes((prev) => [...prev, { text: '', type: 'regular' }])
  }

  /** Reconstruct a ScannedGearPiece from the editable state */
  const buildUpdatedItem = (): ScannedGearPiece => {
    return {
      ...item,
      affixes: affixes.filter((a) => a.type === 'regular').map((a) => a.text),
      temperedAffixes: affixes.filter((a) => a.type === 'tempered').map((a) => a.text),
      greaterAffixes: affixes.filter((a) => a.type === 'greater').map((a) => a.text),
      implicitAffixes: affixes.filter((a) => a.type === 'implicit').map((a) => a.text),
      sockets,
      aspect: aspectName.trim()
        ? { name: aspectName.trim(), description: item.aspect?.description ?? '' }
        : null
    }
  }

  /** Preview: compute match score from current edits */
  const previewVerdict = (): ScanVerdict | null => {
    if (!buildSlot) return null
    return compareGear(buildUpdatedItem(), buildSlot, null)
  }

  const handleSave = (): void => {
    const updated = buildUpdatedItem()
    const verdict = buildSlot ? compareGear(updated, buildSlot, null) : null
    onSave(updated, verdict)
  }

  const preview = previewVerdict()

  return (
    <div className="affix-editor-panel">
      <div className="affix-editor-panel__header">
        <span className="affix-editor-panel__title">Edit Affixes</span>
        {preview && (
          <span className="affix-editor-panel__preview">
            Preview: {preview.buildMatchCount}/{preview.buildTotalExpected} (
            {Math.round(preview.buildMatchPercent)}%)
          </span>
        )}
      </div>

      <div className="affix-editor-panel__list">
        {affixes.map((affix, idx) => (
          <div key={idx} className="affix-editor-row">
            <input
              className="affix-editor-row__text"
              type="text"
              value={affix.text}
              onChange={(e) => handleTextChange(idx, e.target.value)}
              placeholder="Affix name..."
            />
            <select
              className="affix-editor-row__type"
              value={affix.type}
              onChange={(e) => handleTypeChange(idx, e.target.value as AffixType)}
            >
              <option value="regular">Regular</option>
              <option value="tempered">Tempered</option>
              <option value="greater">Greater</option>
              <option value="implicit">Implicit</option>
            </select>
            <button
              className="affix-editor-row__remove"
              onClick={() => handleRemove(idx)}
              title="Remove affix"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button className="affix-editor-panel__add-btn" onClick={handleAdd}>
        ＋ Add Affix
      </button>

      <div className="affix-editor-panel__extras">
        <div className="affix-editor-panel__socket-row">
          <span>Sockets:</span>
          <button
            className="btn btn--sm btn--outline"
            onClick={() => setSockets(Math.max(0, sockets - 1))}
          >
            −
          </button>
          <span className="affix-editor-panel__socket-count">{sockets}</span>
          <button className="btn btn--sm btn--outline" onClick={() => setSockets(sockets + 1)}>
            +
          </button>
        </div>
        <div className="affix-editor-panel__aspect-row">
          <span>Aspect:</span>
          <input
            className="affix-editor-row__text"
            type="text"
            value={aspectName}
            onChange={(e) => setAspectName(e.target.value)}
            placeholder="Aspect name (blank = none)"
          />
        </div>
      </div>

      <div className="affix-editor-panel__actions">
        <button className="btn btn--primary btn--sm" onClick={handleSave}>
          💾 Save & Re-compare
        </button>
        <button className="btn btn--outline btn--sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

export default AffixEditor
