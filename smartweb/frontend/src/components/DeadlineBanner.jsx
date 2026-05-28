import { useState, useMemo } from 'react'

export default function DeadlineBanner({ tasks }) {
  const [dismissed, setDismissed] = useState(false)

  const upcoming = useMemo(() => {
    const now = new Date()
    return (tasks || []).filter(t => {
      if (!t.due_date || t.completed || t.status === 'done') return false
      const due = new Date(t.due_date)
      const diffDays = (due - now) / (1000 * 60 * 60 * 24)
      return diffDays >= 0 && diffDays <= 2
    })
  }, [tasks])

  if (dismissed || upcoming.length === 0) return null

  const first = upcoming[0]
  const diffDays = Math.ceil((new Date(first.due_date) - new Date()) / (1000 * 60 * 60 * 24))
  const dueLabel = diffDays <= 0 ? 'сегодня' : diffDays === 1 ? 'завтра' : 'послезавтра'
  const taskName = (first.title || first.description || '').slice(0, 42)

  return (
    <div style={{
      position: 'fixed', bottom: 96, right: 24, zIndex: 9095,
      display: 'flex', alignItems: 'center', gap: 12,
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderLeft: '4px solid #f59e0b',
      borderRadius: 14,
      boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      padding: '14px 18px',
      minWidth: 270, maxWidth: 340,
      animation: 'popIn 0.25s var(--ease-spring)',
    }}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
        <circle cx="10" cy="10" r="8.5" stroke="#f59e0b" strokeWidth="1.5"/>
        <path d="M10 6V10.5L13 12.5" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text-primary)' }}>
          {upcoming.length === 1
            ? `Срок задачи — ${dueLabel}`
            : `${upcoming.length} задач истекают скоро`}
        </p>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {taskName}{(first.title || first.description || '').length > 42 ? '…' : ''}
        </p>
      </div>
      <button
        onClick={() => setDismissed(true)}
        style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 16, padding: 0, flexShrink: 0 }}
      >✕</button>
    </div>
  )
}
