import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'

/*
 * App-wide toast + confirm, replacing native alert()/confirm().
 * WHY: native dialogs are inconsistent with the product's visual language,
 * block the JS thread, and can't be styled/labelled. These self-mount a portal
 * so they work everywhere (dashboards AND AdminDashboard/AuthPage) with no
 * provider wiring in App.jsx.
 */

// ── Toast ────────────────────────────────────────────────────────────────────
let pushToast = null
function ToastHost() {
  const [items, setItems] = useState([])
  useEffect(() => {
    pushToast = (t) => {
      const id = Date.now() + Math.random()
      setItems(prev => [...prev, { ...t, id }])
      setTimeout(() => setItems(prev => prev.filter(x => x.id !== id)), t.duration || 3500)
    }
    return () => { pushToast = null }
  }, [])
  const color = (type) => type === 'error' ? 'var(--color-danger)' : type === 'success' ? 'var(--color-success)' : 'var(--color-accent)'
  return (
    <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none' }}>
      {items.map(t => (
        <div key={t.id} role="status" style={{
          pointerEvents: 'auto', maxWidth: 'min(92vw, 440px)',
          background: 'var(--color-surface)', color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border)', borderLeft: `3px solid ${color(t.type)}`,
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
          padding: '11px 16px', fontSize: 13.5, fontWeight: 500,
          animation: 'toastSlide 0.25s var(--ease-spring)',
        }}>{t.message}</div>
      ))}
    </div>
  )
}

export function toast(message, type = 'info', duration) {
  ensureMounted()
  const fire = () => pushToast && pushToast({ message, type, duration })
  if (pushToast) fire(); else setTimeout(fire, 0)
}

// ── Confirm ──────────────────────────────────────────────────────────────────
let setConfirm = null
function ConfirmHost() {
  const [opts, setOpts] = useState(null)
  useEffect(() => { setConfirm = setOpts; return () => { setConfirm = null } }, [])
  useEffect(() => {
    if (!opts) return
    const onKey = (e) => { if (e.key === 'Escape') done(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [opts])
  if (!opts) return null
  const done = (v) => { opts.resolve(v); setOpts(null) }
  return (
    <div className="overlay-center" role="dialog" aria-modal="true" onClick={() => done(false)} style={{ zIndex: 9800 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>{opts.title}</h3>
        {opts.message && <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', margin: '0 0 20px', lineHeight: 1.5 }}>{opts.message}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => done(false)}>{opts.cancelText || 'Отмена'}</button>
          <button className={opts.danger ? 'btn btn-danger btn-sm' : 'btn btn-accent btn-sm'} autoFocus onClick={() => done(true)}>
            {opts.confirmText || 'Подтвердить'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function confirmDialog(opts) {
  ensureMounted()
  return new Promise(resolve => {
    const fire = () => setConfirm && setConfirm({ ...opts, resolve })
    if (setConfirm) fire(); else setTimeout(fire, 0)
  })
}

// ── Portal bootstrap ─────────────────────────────────────────────────────────
let mounted = false
function ensureMounted() {
  if (mounted || typeof document === 'undefined') return
  mounted = true
  const el = document.createElement('div')
  el.id = 'ui-portal'
  document.body.appendChild(el)
  createRoot(el).render(<><ToastHost /><ConfirmHost /></>)
}
