import { useState } from 'react'
import type { ScannedGearPiece, IGearSlot, AffixType, ScanVerdict, IAffix } from '../../../shared/types'
import { compareGear } from '../../../shared/GearComparer'

interface AffixEditorProps {
  item: ScannedGearPiece
  buildSlot: IGearSlot | null
  onSave: (updated: ScannedGearPiece, newVerdict: ScanVerdict | null, updatedBuildSlot?: IGearSlot) => void
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
  const [itemPower, setItemPower] = useState(item.itemPower)

  // Local build slot threshold state
  const [localBuildSlot, setLocalBuildSlot] = useState<IGearSlot | null>(
    buildSlot ? JSON.parse(JSON.stringify(buildSlot)) : null
  )

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

  /** Modify the build's minimum stat threshold */
  const handleThresholdChange = (index: number, val: string): void => {
    if (!localBuildSlot) return
    const num = parseFloat(val)
    const updated = { ...localBuildSlot }
    if (!isNaN(num)) {
      updated.affixes[index].minValue = num
    } else {
      updated.affixes[index].minValue = undefined
    }
    setLocalBuildSlot(updated)
  }

  const handleMinItemPowerChange = (val: string): void => {
    if (!localBuildSlot) return
    const num = parseInt(val)
    const updated = { ...localBuildSlot }
    if (!isNaN(num)) {
      updated.minItemPower = num
    } else {
      updated.minItemPower = undefined
    }
    setLocalBuildSlot(updated)
  }

  /** Reconstruct a ScannedGearPiece from the editable state */
  const buildUpdatedItem = (): ScannedGearPiece => {
    return {
      ...item,
      itemPower,
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
    if (!localBuildSlot) return null
    return compareGear(buildUpdatedItem(), localBuildSlot)
  }

  const handleSave = (): void => {
    const updated = buildUpdatedItem()
    const verdict = localBuildSlot ? compareGear(updated, localBuildSlot) : null
    onSave(updated, verdict, localBuildSlot ?? undefined)
  }

  const preview = previewVerdict()

  return (
    <div className="affix-editor-panel">
      <div className="affix-editor-panel__header">
        <span className="affix-editor-panel__title">Edit Affixes & Thresholds</span>
        {preview && (
          <span className="affix-editor-panel__preview">
            Preview: {preview.buildMatchCount}/{preview.buildTotalExpected} (
            {Math.round(preview.buildMatchPercent)}%)
          </span>
        )}
      </div>

      <div className="affix-editor-panel__list">
        <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '0.9em', color: 'var(--text-dim)' }}>
          Scanned Gear Roll Values
        </div>
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

      <button className="affix-editor-panel__add-btn" onClick={handleAdd} style={{ marginBottom: '16px' }}>
        ＋ Add Affix
      </button>

      {localBuildSlot && localBuildSlot.affixes.length > 0 && (
        <div className="affix-editor-panel__list">
          <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '0.9em', color: 'var(--text-dim)' }}>
            Build Base Affix Thresholds
          </div>
          {localBuildSlot.affixes.map((affix, idx) => (
            <div key={idx} className="affix-editor-row">
              <span className="affix-editor-row__label" style={{ flex: 1, fontSize: '13px' }}>
                {affix.name}
              </span>
              <input
                className="affix-editor-row__text"
                type="number"
                step="0.1"
                value={affix.minValue ?? ''}
                onChange={(e) => handleThresholdChange(idx, e.target.value)}
                placeholder="Min value..."
                style={{ width: '100px', flex: 'none' }}
              />
            </div>
          ))}
        </div>
      )}

      <div className="affix-editor-panel__extras" style={{ marginTop: '16px' }}>
        <div className="affix-editor-panel__socket-row" style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ minWidth: '80px' }}>Item Power:</span>
          <input
            className="affix-editor-row__text"
            type="number"
            value={itemPower}
            onChange={(e) => setItemPower(parseInt(e.target.value) || 0)}
            style={{ width: '80px' }}
          />
          {localBuildSlot && (
            <>
              <span style={{ marginLeft: '16px' }}>Min IP Requirement:</span>
              <input
                className="affix-editor-row__text"
                type="number"
                value={localBuildSlot.minItemPower ?? ''}
                onChange={(e) => handleMinItemPowerChange(e.target.value)}
                placeholder="e.g. 900"
                style={{ width: '80px' }}
              />
            </>
          )}
        </div>
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
