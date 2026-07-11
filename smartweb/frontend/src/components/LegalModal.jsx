import { useState, useEffect } from 'react'
import { LEGAL_DOCS } from '../lib/legalDocs'
import useEscapeKey from '../lib/useEscapeKey'

// Modal showing the legal documents inside the web app.
// Used from the user menu ("Документы") and from the auth page consent link.
export default function LegalModal({ open, initialKey, onClose }) {
  const [active, setActive] = useState(initialKey || LEGAL_DOCS[0].key)
  useEffect(() => { if (open && initialKey) setActive(initialKey) }, [open, initialKey])
  useEscapeKey(onClose, open)  // keyboard escape hatch
  if (!open) return null
  const doc = LEGAL_DOCS.find(d => d.key === active) || LEGAL_DOCS[0]

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9600, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '24px 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 760, marginTop: 24, padding: 0, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
          <strong style={{ fontSize: 16 }}>Документы</strong>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-text-muted)' }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', overflowX: 'auto', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
          {LEGAL_DOCS.map(d => (
            <button key={d.key} onClick={() => setActive(d.key)} style={{
              whiteSpace: 'nowrap', padding: '7px 12px', borderRadius: 99, cursor: 'pointer', fontSize: 12, fontWeight: 600,
              border: '1px solid var(--color-border)',
              background: active === d.key ? 'var(--color-accent)' : 'transparent',
              color: active === d.key ? '#fff' : 'var(--color-text-secondary)',
            }}>{d.title}</button>
          ))}
        </div>
        <div style={{ padding: '20px 24px', overflowY: 'auto' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>{doc.title}</h2>
          {doc.subtitle && <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 16px' }}>{doc.subtitle}</p>}
          <div className="legal-body" dangerouslySetInnerHTML={{ __html: doc.html }} />
        </div>
      </div>
    </div>
  )
}
