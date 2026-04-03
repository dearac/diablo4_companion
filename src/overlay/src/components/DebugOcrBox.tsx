import React from 'react'

export function DebugOcrBox({ rawText }: { rawText: string }): React.JSX.Element {
  return (
    <div
      style={{
        position: 'absolute',
        left: '100%',
        top: 0,
        marginLeft: '16px',
        background: 'rgba(0,0,0,0.85)',
        padding: '12px',
        borderRadius: '8px',
        border: '1px solid #444',
        maxWidth: '350px',
        maxHeight: '400px',
        overflow: 'auto',
        pointerEvents: 'none',
        zIndex: 1000
      }}
    >
      <div
        style={{
          color: '#aaa',
          fontSize: '10px',
          marginBottom: '8px',
          textTransform: 'uppercase',
          letterSpacing: '1px'
        }}
      >
        Raw OCR Output
      </div>
      <pre
        style={{
          margin: 0,
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#fff',
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word',
          lineHeight: 1.4
        }}
      >
        {rawText || 'No text detected'}
      </pre>
    </div>
  )
}
