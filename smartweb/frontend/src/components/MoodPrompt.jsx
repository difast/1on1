import { useState, useEffect } from 'react'
import { submitMood } from '../api/client'

const MOODS = [
  { score: 1, emoji: '😢', label: 'Плохо' },
  { score: 2, emoji: '😕', label: 'Не очень' },
  { score: 3, emoji: '😐', label: 'Нормально' },
  { score: 4, emoji: '🙂', label: 'Хорошо' },
  { score: 5, emoji: '😄', label: 'Отлично' },
]

const todayKey = () => `mood_submitted_${new Date().toDateString()}`

export default function MoodPrompt({ teamId }) {
  const [visible, setVisible] = useState(false)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!teamId) return
    if (localStorage.getItem(todayKey())) return

    const now = new Date()
    const target = new Date()
    target.setHours(20, 0, 0, 0)

    if (now >= target) {
      // Already past 20:00 today — show banner immediately
      setVisible(true)
      return
    }

    const delay = target - now
    const t = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(t)
  }, [teamId])

  const handleSubmit = async () => {
    if (!selected || submitting) return
    setSubmitting(true)
    try {
      await submitMood({ team_id: teamId, score: selected })
      localStorage.setItem(todayKey(), '1')
      setDone(true)
      setTimeout(() => { setOpen(false); setVisible(false) }, 1800)
    } catch { } finally { setSubmitting(false) }
  }

  if (!visible) return null

  return (
    <>
      {/* Banner toast */}
      {!open && (
        <div
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9100,
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderLeft: '4px solid #8b5cf6',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            padding: '12px 16px',
            minWidth: 260, maxWidth: 320,
            cursor: 'pointer',
            animation: 'popIn 0.22s var(--ease-spring)',
          }}
        >
          <span style={{ fontSize: 22 }}>🌙</span>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary)' }}>Как прошёл день?</p>
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>Оцените настроение — анонимно</p>
          </div>
          <button
            onClick={e => { e.stopPropagation(); setVisible(false) }}
            style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 16, padding: 0 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Mood form modal */}
      {open && (
        <div
          className="overlay-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 380, textAlign: 'center' }}
          >
            {done ? (
              <div style={{ padding: '24px 0' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
                <p style={{ fontWeight: 600, fontSize: 16, color: 'var(--color-text-primary)' }}>Спасибо!</p>
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 6 }}>Ваш отзыв анонимно учтён</p>
              </div>
            ) : (
              <>
                <div className="modal-header">
                  <span className="modal-title">🌙 Настроение за день</span>
                  <button className="modal-close" onClick={() => setOpen(false)}>✕</button>
                </div>
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>
                  Это анонимно — тимлид видит только общую картину команды
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 24 }}>
                  {MOODS.map(m => (
                    <button
                      key={m.score}
                      onClick={() => setSelected(m.score)}
                      title={m.label}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                        padding: '10px 8px', borderRadius: 12, border: 'none',
                        background: selected === m.score ? '#ede9fe' : 'var(--color-bg)',
                        outline: selected === m.score ? '2px solid #8b5cf6' : '2px solid transparent',
                        cursor: 'pointer', transition: 'all 0.15s',
                        transform: selected === m.score ? 'scale(1.12)' : 'scale(1)',
                      }}
                    >
                      <span style={{ fontSize: 28 }}>{m.emoji}</span>
                      <span style={{ fontSize: 10, color: selected === m.score ? '#7c3aed' : 'var(--color-text-muted)', fontWeight: 600 }}>{m.label}</span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={!selected || submitting}
                  className="btn btn-accent"
                  style={{ width: '100%', opacity: selected ? 1 : 0.45 }}
                >
                  {submitting ? 'Отправляем...' : 'Отправить'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
