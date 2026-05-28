import { useState, useEffect } from 'react'
import { getTeamMoodSummary } from '../api/client'

export default function MoodDropBanner({ teamId }) {
  const [show, setShow] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!teamId || dismissed) return
    getTeamMoodSummary(teamId).then(({ data }) => {
      const days = (data.days || []).filter(d => d.avg !== null && d.count > 0)
      if (days.length < 3) return
      const last3 = days.slice(-3)
      const dropping = last3[0].avg > last3[1].avg && last3[1].avg > last3[2].avg
      if (dropping) setShow(true)
    }).catch(() => {})
  }, [teamId, dismissed])

  if (!show || dismissed) return null

  return (
    <div style={{
      position: 'fixed', bottom: 168, right: 24, zIndex: 9092,
      display: 'flex', alignItems: 'center', gap: 12,
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderLeft: '4px solid #ef4444',
      borderRadius: 14,
      boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      padding: '14px 18px',
      minWidth: 270, maxWidth: 340,
      animation: 'popIn 0.25s var(--ease-spring)',
    }}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
        <polyline points="2,5 7,13 12,9 18,17" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <polyline points="14,17 18,17 18,13" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text-primary)', margin: 0 }}>
          Настроение падает 3 дня подряд
        </p>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
          Стоит провести 1-on-1 с командой
        </p>
      </div>
      <button
        onClick={() => { setShow(false); setDismissed(true) }}
        style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 16, padding: 0, flexShrink: 0 }}
      >✕</button>
    </div>
  )
}
