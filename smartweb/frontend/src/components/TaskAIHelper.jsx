import { useState } from 'react'
import { getTaskAIAdvice } from '../api/client'

export default function TaskAIHelper({ task, role = 'member' }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [steps, setSteps] = useState(null)

  const fetchSteps = async () => {
    setLoading(true)
    setSteps(null)
    try {
      const { data } = await getTaskAIAdvice({
        title: task.title || task.description || '',
        status: task.status,
        due_date: task.due_date,
        role,
      })
      setSteps(data.steps?.length ? data.steps : null)
    } catch {
      setSteps(null)
    } finally {
      setLoading(false)
    }
  }

  const handleOpen = async () => {
    setOpen(true)
    if (steps) return
    fetchSteps()
  }

  return (
    <>
      <button
        onClick={handleOpen}
        title="AI-подсказка по задаче"
        style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'linear-gradient(135deg, #a855f7, #6366f1, #3b82f6)',
          backgroundSize: '200% 200%',
          border: '2px solid rgba(255,255,255,0.3)',
          cursor: 'pointer', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, color: 'white', fontWeight: 900, letterSpacing: '-0.5px',
          animation: 'aiPulse 2s infinite, aiSpin 4s linear infinite',
          boxShadow: '0 0 12px rgba(139,92,246,0.5)',
          transition: 'transform 0.15s, box-shadow 0.15s',
          position: 'relative',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.2)'; e.currentTarget.style.boxShadow = '0 0 20px rgba(139,92,246,0.8)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 0 12px rgba(139,92,246,0.5)' }}
      >
        ✦
      </button>

      {open && (
        <div className="overlay-center" onClick={() => setOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440, width: '90vw' }}>
            <div className="modal-header" style={{ paddingBottom: 12 }}>
              <div>
                <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #a855f7, #6366f1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, flexShrink: 0,
                  }}>✦</span>
                  AI-помощник
                </span>
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>Конкретные шаги по выполнению задачи</p>
              </div>
              <button className="modal-close" onClick={() => setOpen(false)}>✕</button>
            </div>

            <div style={{
              background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)',
              borderRadius: 10, padding: '10px 14px', marginBottom: 16,
              border: '1px solid #ddd6fe',
            }}>
              <p style={{ fontSize: 13, color: '#7c3aed', fontWeight: 600, margin: 0, lineHeight: 1.4 }}>
                {task.title || task.description}
              </p>
            </div>

            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 0' }}>
                <div className="spinner" style={{ borderColor: '#ddd6fe', borderTopColor: '#8b5cf6' }} />
                <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>AI анализирует задачу...</span>
              </div>
            ) : steps ? (
              <ol style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 0, listStyle: 'none', paddingBottom: 4 }}>
                {steps.map((step, i) => (
                  <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{
                      width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                      background: 'linear-gradient(135deg, #a855f7, #6366f1)',
                      color: 'white', fontSize: 11, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      marginTop: 1,
                    }}>{i + 1}</span>
                    <span style={{ fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.6 }}>{step}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '16px 0' }}>
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>AI не смог обработать запрос</p>
                <button
                  onClick={fetchSteps}
                  style={{
                    background: 'linear-gradient(135deg, #a855f7, #6366f1)',
                    border: 'none', borderRadius: 8, color: 'white',
                    fontSize: 12, fontWeight: 700, padding: '7px 18px', cursor: 'pointer',
                  }}
                >Повторить</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
