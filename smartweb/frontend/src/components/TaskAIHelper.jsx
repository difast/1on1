import { useState } from 'react'
import { getTaskAIAdvice } from '../api/client'

export default function TaskAIHelper({ task, role = 'member' }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [steps, setSteps] = useState(null)

  const handleOpen = async () => {
    setOpen(true)
    if (steps) return
    setLoading(true)
    try {
      const { data } = await getTaskAIAdvice({
        title: task.title || task.description || '',
        status: task.status,
        due_date: task.due_date,
        role,
      })
      setSteps(data.steps || [])
    } catch {
      setSteps(['Уточните требования к задаче', 'Разбейте на подзадачи', 'Обсудите приоритеты с командой'])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        title="AI-подсказка по задаче"
        style={{
          width: 26, height: 26, borderRadius: '50%',
          background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
          border: 'none', cursor: 'pointer', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, color: 'white', fontWeight: 800, letterSpacing: '-0.5px',
          animation: 'aiPulse 2.5s infinite',
          transition: 'transform 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.15)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        AI
      </button>

      {open && (
        <div className="overlay-center" onClick={() => setOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, width: '90vw' }}>
            <div className="modal-header" style={{ paddingBottom: 12 }}>
              <div>
                <span className="modal-title">✨ AI-помощник</span>
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>Рекомендации по задаче</p>
              </div>
              <button className="modal-close" onClick={() => setOpen(false)}>✕</button>
            </div>

            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16, fontStyle: 'italic', lineHeight: 1.4 }}>
              «{task.title || task.description}»
            </p>

            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 0' }}>
                <div className="spinner" />
                <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>AI анализирует задачу...</span>
              </div>
            ) : steps && (
              <ol style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 0, listStyle: 'none', paddingBottom: 4 }}>
                {steps.map((step, i) => (
                  <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                      background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                      color: 'white', fontSize: 11, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      marginTop: 1,
                    }}>{i + 1}</span>
                    <span style={{ fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.5 }}>{step}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </>
  )
}
