import { useState, useEffect } from 'react'
import { submitMood } from '../api/client'

const QUESTIONS = [
  { id: 'overall', label: 'Как прошёл день?', placeholder: 'Расскажите в нескольких словах...', required: true },
  { id: 'energy', label: 'Что давало вам энергию?', placeholder: 'Задачи, общение, достижения...', required: false },
  { id: 'blocker', label: 'Что мешало работе?', placeholder: 'Блокеры, усталость, отвлечения...', required: false },
  { id: 'team', label: 'Хотите что-то донести до команды?', placeholder: 'Анонимно — тимлид увидит обобщённо...', required: false },
]

const todayKey = () => `mood_submitted_${new Date().toDateString()}`

export default function MoodPrompt({ teamId }) {
  const [visible, setVisible] = useState(false)
  const [open, setOpen] = useState(false)
  const [answers, setAnswers] = useState({ overall: '', energy: '', blocker: '', team: '' })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [resultScore, setResultScore] = useState(null)

  useEffect(() => {
    if (!teamId) return
    if (localStorage.getItem(todayKey())) return

    const now = new Date()
    const target = new Date()
    target.setHours(20, 0, 0, 0)

    if (now >= target) { setVisible(true); return }
    const delay = target - now
    const t = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(t)
  }, [teamId])

  const canSubmit = answers.overall.trim().length > 0

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return
    setSubmitting(true)
    try {
      const answerList = QUESTIONS.map(q => answers[q.id].trim())
      const res = await submitMood({ team_id: teamId, answers: answerList })
      localStorage.setItem(todayKey(), '1')
      setResultScore(res.data?.score ?? null)
      setDone(true)
      setTimeout(() => { setOpen(false); setVisible(false) }, 2500)
    } catch { } finally { setSubmitting(false) }
  }

  const SCORE_COLORS = ['', '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e']
  const SCORE_LABELS = ['', 'Плохо', 'Не очень', 'Нормально', 'Хорошо', 'Отлично']

  if (!visible) return null

  return (
    <>
      {/* Floating banner */}
      {!open && (
        <div
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: 210, right: 24, zIndex: 9100,
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderLeft: '4px solid #3B6EF0',
            borderRadius: 14,
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            padding: '14px 18px',
            minWidth: 270, maxWidth: 330,
            cursor: 'pointer',
            animation: 'popIn 0.25s var(--ease-spring)',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ flexShrink: 0 }}>
              <path d="M19 12.5A8 8 0 1 1 9.5 3a6 6 0 0 0 9.5 9.5z" fill="#3B6EF0" opacity="0.9"/>
            </svg>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text-primary)' }}>Как прошёл день?</p>
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>Мини-опрос · 1 минута · анонимно</p>
          </div>
          <button
            onClick={e => { e.stopPropagation(); setVisible(false) }}
            style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 16, padding: 0, flexShrink: 0 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Survey modal */}
      {open && (
        <div className="overlay-center" onClick={() => !submitting && setOpen(false)}>
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 460, width: '90vw' }}
          >
            {done ? (
              <div style={{ padding: '32px 24px', textAlign: 'center' }}>
                <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
                  {resultScore ? (
                    <div style={{
                      width: 56, height: 56, borderRadius: '50%',
                      background: SCORE_COLORS[resultScore],
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'white', fontWeight: 800, fontSize: 22,
                    }}>{resultScore}</div>
                  ) : (
                    <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                      <circle cx="28" cy="28" r="26" stroke="#4f46e5" strokeWidth="2.5"/>
                      <path d="M17 28l8 8 14-16" stroke="#4f46e5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <p style={{ fontWeight: 700, fontSize: 17, color: 'var(--color-text-primary)', marginBottom: 8 }}>
                  Спасибо за честный ответ!
                </p>
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                  Ваш отзыв анонимно обработан ИИ и добавлен в аналитику команды.
                  Тимлид видит только обобщённые тренды, не ваши слова.
                </p>
              </div>
            ) : (
              <>
                <div className="modal-header" style={{ paddingBottom: 12 }}>
                  <div>
                    <span className="modal-title">Опрос по итогам дня</span>
                    <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>
                      Анонимно · ответы анализирует ИИ
                    </p>
                  </div>
                  <button className="modal-close" onClick={() => setOpen(false)}>✕</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0 8px' }}>
                  {QUESTIONS.map(q => (
                    <div key={q.id} className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: 13 }}>
                        {q.label}{q.required && <span style={{ color: 'var(--color-danger)', marginLeft: 3 }}>*</span>}
                      </label>
                      <textarea
                        value={answers[q.id]}
                        onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                        placeholder={q.placeholder}
                        rows={q.id === 'overall' ? 3 : 2}
                        className="input"
                        style={{ resize: 'none', fontSize: 13, lineHeight: 1.5 }}
                      />
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)', flex: 1 }}>
                    Имя не сохраняется
                  </span>
                  <button
                    onClick={handleSubmit}
                    disabled={!canSubmit || submitting}
                    className="btn btn-accent"
                    style={{ minWidth: 120, opacity: canSubmit ? 1 : 0.5 }}
                  >
                    {submitting ? 'Анализ ИИ...' : 'Отправить'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
