import { useState, useEffect, useRef, useId, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

/*
 * 3D-иконки статусов (Задача 1): объёмная «сфера» на радиальном градиенте с
 * бликом и мягкой тенью, внутри — символ статуса. Без emoji-символов. Каждый
 * инстанс использует уникальные id градиентов (useId), чтобы не конфликтовать.
 */
const StatusIcon = ({ type, size = 16 }) => {
  const uid = useId().replace(/:/g, '')
  const c = ICON_COLORS[type] || ICON_COLORS.in_progress
  const gId = `g3d-${type}-${uid}`
  const hId = `h3d-${type}-${uid}`
  const sId = `s3d-${type}-${uid}`
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
      <defs>
        <radialGradient id={gId} cx="35%" cy="28%" r="75%">
          <stop offset="0%" stopColor={c.light} />
          <stop offset="45%" stopColor={c.main} />
          <stop offset="100%" stopColor={c.dark} />
        </radialGradient>
        <radialGradient id={hId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.9)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <filter id={sId} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1.2" stdDeviation="1.1" floodColor={c.dark} floodOpacity="0.45" />
        </filter>
      </defs>
      {/* Объёмная сфера */}
      <circle cx="12" cy="12" r="9" fill={`url(#${gId})`} filter={`url(#${sId})`} />
      {/* Блик сверху-слева для эффекта объёма */}
      <ellipse cx="9" cy="8" rx="4.2" ry="3" fill={`url(#${hId})`} />
      {/* Символ статуса поверх сферы */}
      {type === 'in_progress' && (
        <path d="M12 8v4l2.6 2" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {type === 'blocked' && (
        <line x1="8.6" y1="8.6" x2="15.4" y2="15.4" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" />
      )}
      {type === 'review' && (
        <circle cx="12" cy="12" r="2.6" fill="#fff" />
      )}
      {type === 'done' && (
        <polyline points="8,12.2 11,15 16,8.6" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  )
}

// Цвета «сферы» для 3D-иконок (светлый блик / основной / тёмный низ).
const ICON_COLORS = {
  in_progress: { light: '#93c5fd', main: '#3b82f6', dark: '#1e40af' },
  blocked:     { light: '#fca5a5', main: '#ef4444', dark: '#991b1b' },
  review:      { light: '#fcd34d', main: '#f59e0b', dark: '#92400e' },
  done:        { light: '#86efac', main: '#22c55e', dark: '#15803d' },
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

export { StatusIcon }

const LEAD_OPTIONS   = ['in_progress', 'review', 'blocked', 'done']
const MEMBER_OPTIONS = ['in_progress', 'review', 'blocked']

const DROPDOWN_W = 230
const MARGIN = 8

export default function TaskStatusSelect({ status, onChange, canMarkDone = true, allowDone }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)  // { left, top/bottom, placement, width, maxHeight }
  const ref = useRef(null)
  const menuRef = useRef(null)
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.in_progress
  const canDone = allowDone !== undefined ? allowDone : canMarkDone
  const options = canDone ? LEAD_OPTIONS : MEMBER_OPTIONS

  // Адаптивное позиционирование (Задача 1): dropdown через портал c fixed-
  // координатами — не обрезается родительскими overflow/transform. Открываем
  // вверх, если снизу не помещается; выравниваем по правому краю, если уходит
  // за правую границу; ширину ограничиваем вьюпортом (мобильная версия).
  const computePosition = () => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const width = Math.min(DROPDOWN_W, vw - MARGIN * 2)

    // Горизонталь: по умолчанию по левому краю триггера; если не влезает —
    // выравниваем правый край dropdown по правому краю триггера; затем клампим.
    let left = r.left
    if (left + width > vw - MARGIN) left = r.right - width
    left = Math.max(MARGIN, Math.min(left, vw - width - MARGIN))

    // Вертикаль: вниз, если снизу достаточно места, иначе вверх (туда, где больше).
    const spaceBelow = vh - r.bottom - MARGIN
    const spaceAbove = r.top - MARGIN
    const desired = 300
    let placement, top, bottom, maxHeight
    if (spaceBelow >= Math.min(desired, 200) || spaceBelow >= spaceAbove) {
      placement = 'down'
      top = r.bottom + MARGIN
      bottom = null
      maxHeight = Math.max(140, spaceBelow)
    } else {
      placement = 'up'
      top = null
      bottom = vh - r.top + MARGIN
      maxHeight = Math.max(140, spaceAbove)
    }
    setPos({ left, width, placement, top, bottom, maxHeight })
  }

  useLayoutEffect(() => {
    if (!open) return
    computePosition()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => {
      if (ref.current?.contains(e.target)) return
      if (menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    // При скролле/ресайзе закрываем — позиция гарантированно не «залипает».
    const onScrollResize = () => setOpen(false)
    document.addEventListener('mousedown', onDocClick)
    window.addEventListener('scroll', onScrollResize, true)
    window.addEventListener('resize', onScrollResize)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      window.removeEventListener('scroll', onScrollResize, true)
      window.removeEventListener('resize', onScrollResize)
    }
  }, [open])

  const dropdown = open && pos && createPortal(
    <div
      ref={menuRef}
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed', zIndex: 9999,
        left: pos.left, width: pos.width,
        ...(pos.placement === 'down' ? { top: pos.top } : { bottom: pos.bottom }),
        maxHeight: pos.maxHeight, overflowY: 'auto',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        boxShadow: '0 12px 32px rgba(0,0,0,0.16)',
        padding: 6,
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
              width: 34, height: 34, borderRadius: 9, flexShrink: 0,
              background: active ? c.bg : 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: active ? `2px solid ${c.dot}` : `1px solid ${c.dot}33`,
            }}><StatusIcon type={o} size={20} /></span>
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
    </div>,
    document.body
  )

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
        <StatusIcon type={status} size={15} />
        {cfg.label}
        <svg width="9" height="6" viewBox="0 0 9 6" fill="currentColor"
          style={{ opacity: 0.6, marginLeft: 1, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <path d="M0 0l4.5 6L9 0z" />
        </svg>
      </button>
      {dropdown}
    </div>
  )
}
