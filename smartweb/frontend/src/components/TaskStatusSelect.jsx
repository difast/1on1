import { useState, useEffect, useRef } from 'react'

const STATUS_CONFIG = {
  in_progress: { label: 'В работе', emoji: '🔄', bg: '#dbeafe', color: '#1d4ed8', dot: '#3b82f6' },
  blocked:     { label: 'Блокер',   emoji: '🚫', bg: '#fee2e2', color: '#dc2626', dot: '#ef4444' },
  review:      { label: 'На ревью', emoji: '👀', bg: '#fef3c7', color: '#b45309', dot: '#f59e0b' },
  done:        { label: 'Готово',   emoji: '✅', bg: '#dcfce7', color: '#15803d', dot: '#22c55e' },
}

export const STATUS_LABEL = Object.fromEntries(
  Object.entries(STATUS_CONFIG).map(([k, v]) => [k, v.label])
)

const LEAD_OPTIONS   = ['in_progress', 'blocked', 'review', 'done']
const MEMBER_OPTIONS = ['in_progress', 'blocked', 'review']

export default function TaskStatusSelect({ status, onChange, canMarkDone = true }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.in_progress
  const options = canMarkDone ? LEAD_OPTIONS : MEMBER_OPTIONS

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
      {/* Trigger pill */}
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '4px 10px 4px 8px',
          borderRadius: 9999,
          border: 'none',
          background: cfg.bg,
          color: cfg.color,
          fontSize: 11, fontWeight: 700,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: 'opacity 0.15s',
          outline: 'none',
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.82'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        <span style={{ fontSize: 12 }}>{cfg.emoji}</span>
        {cfg.label}
        <svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor" style={{ opacity: 0.6, marginLeft: 1 }}>
          <path d="M0 0l4 5 4-5z" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0,
          zIndex: 999,
          background: 'var(--color-bg-primary, #fff)',
          border: '1px solid var(--color-border, #e5e7eb)',
          borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          padding: 4,
          minWidth: 140,
          overflow: 'hidden',
        }}>
          {options.map(o => {
            const c = STATUS_CONFIG[o]
            const active = o === (status || 'in_progress')
            return (
              <button
                key={o}
                onClick={e => { e.stopPropagation(); onChange(o); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '7px 10px',
                  borderRadius: 7, border: 'none',
                  background: active ? c.bg : 'transparent',
                  cursor: 'pointer',
                  fontSize: 13, fontWeight: active ? 700 : 500,
                  color: active ? c.color : 'var(--color-text-primary, #1e2333)',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--color-bg-secondary, #f3f4f6)' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: c.dot, flexShrink: 0,
                }} />
                <span style={{ fontSize: 14 }}>{c.emoji}</span>
                {c.label}
                {active && (
                  <svg style={{ marginLeft: 'auto' }} width="14" height="14" viewBox="0 0 14 14" fill={c.color}>
                    <path d="M2 7l4 4 6-7" stroke={c.color} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
