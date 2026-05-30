import { useState, useEffect, useRef } from 'react'

const StatusIcon = ({ type, color, size = 14 }) => {
  if (type === 'in_progress') return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6" stroke={color} strokeWidth="1.5"/>
      <path d="M7 4v3l2 2" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
  if (type === 'blocked') return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6" stroke={color} strokeWidth="1.5"/>
      <line x1="3.5" y1="3.5" x2="10.5" y2="10.5" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
  if (type === 'review') return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6" stroke={color} strokeWidth="1.5"/>
      <circle cx="7" cy="7" r="2" fill={color}/>
    </svg>
  )
  if (type === 'done') return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6" stroke={color} strokeWidth="1.5"/>
      <polyline points="4,7 6,9.5 10,4.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
  return null
}

const STATUS_CONFIG = {
  in_progress: {
    label: 'В работе',
    desc: 'Задача активна и выполняется',
    bg: '#dbeafe', color: '#1d4ed8', dot: '#3b82f6',
    hoverBg: '#bfdbfe',
  },
  blocked: {
    label: 'Блокер',
    desc: 'Есть препятствие для выполнения',
    bg: '#fee2e2', color: '#dc2626', dot: '#ef4444',
    hoverBg: '#fecaca',
  },
  review: {
    label: 'На ревью',
    desc: 'Ожидает проверки',
    bg: '#fef3c7', color: '#b45309', dot: '#f59e0b',
    hoverBg: '#fde68a',
  },
  done: {
    label: 'Готово',
    desc: 'Задача выполнена',
    bg: '#dcfce7', color: '#15803d', dot: '#22c55e',
    hoverBg: '#bbf7d0',
  },
}

export const STATUS_LABEL = Object.fromEntries(
  Object.entries(STATUS_CONFIG).map(([k, v]) => [k, v.label])
)

const LEAD_OPTIONS   = ['in_progress', 'review', 'blocked', 'done']
const MEMBER_OPTIONS = ['in_progress', 'review', 'blocked']

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
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 11px 5px 9px',
          borderRadius: 9999,
          border: `1.5px solid ${cfg.dot}44`,
          background: cfg.bg,
          color: cfg.color,
          fontSize: 12, fontWeight: 700,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: 'all 0.15s',
          outline: 'none',
          boxShadow: open ? `0 0 0 3px ${cfg.dot}22` : 'none',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = cfg.hoverBg }}
        onMouseLeave={e => { e.currentTarget.style.background = cfg.bg }}
      >
        <StatusIcon type={status} color={cfg.color} size={13} />
        {cfg.label}
        <svg width="9" height="6" viewBox="0 0 9 6" fill="currentColor"
          style={{ opacity: 0.6, marginLeft: 1, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <path d="M0 0l4.5 6L9 0z" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0,
          zIndex: 1000,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          boxShadow: '0 12px 32px rgba(0,0,0,0.16)',
          padding: 6,
          minWidth: 210,
          overflow: 'hidden',
          animation: 'popIn 0.15s ease',
        }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '4px 10px 6px' }}>
            Сменить статус
          </p>
          {options.map(o => {
            const c = STATUS_CONFIG[o]
            const active = o === (status || 'in_progress')
            return (
              <button
                key={o}
                onClick={e => { e.stopPropagation(); onChange(o); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '9px 12px',
                  borderRadius: 8, border: 'none',
                  background: active ? c.bg : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--color-bg)' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, border: active ? `2px solid ${c.dot}` : `1px solid ${c.dot}44`,
                }}><StatusIcon type={o} color={c.color} size={16} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? c.color : 'var(--color-text-primary)', margin: 0, lineHeight: 1.2 }}>
                    {c.label}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0, marginTop: 1 }}>
                    {c.desc}
                  </p>
                </div>
                {active && (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M3 8l4 4 6-7" stroke={c.dot} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
