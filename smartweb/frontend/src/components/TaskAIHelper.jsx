import { useState } from 'react'
import { getTaskAIAdvice, createSubtasks } from '../api/client'
import useEscapeKey from '../lib/useEscapeKey'

export default function TaskAIHelper({ task, role = 'member', onSubtasksAdded }) {
  const [open, setOpen] = useState(false)
  useEscapeKey(() => setOpen(false), open)  // keyboard escape hatch
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [steps, setSteps] = useState(null)
  const [added, setAdded] = useState(false)

  const fetchSteps = async () => {
    setLoading(true)
    setSteps(null)
    setAdded(false)
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

  const handleAdd = async () => {
    if (!steps?.length || adding) return
    setAdding(true)
    try {
      await createSubtasks(task.id, steps)
      setAdded(true)
      onSubtasksAdded?.()
      setTimeout(() => setOpen(false), 800)
    } catch {
    } finally {
      setAdding(false)
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        title="AI-подсказка по задаче"
        style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'linear-gradient(135deg, #3B6EF0, #2554D4, #3b82f6)',
          border: '2px solid rgba(255,255,255,0.3)',
          cursor: 'pointer', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, color: 'white', fontWeight: 900,
          animation: 'aiPulse 2s infinite, aiSpin 4s linear infinite',
          boxShadow: '0 0 12px rgba(59,110,240,0.5)',
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.2)'; e.currentTarget.style.boxShadow = '0 0 20px rgba(59,110,240,0.8)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 0 12px rgba(59,110,240,0.5)' }}
        aria-label="AI-помощник по задаче"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/></svg>
      </button>

      {open && (
        <div className="overlay-center" onClick={() => setOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440, width: '90vw' }}>
            <div className="modal-header" style={{ paddingBottom: 12 }}>
              <div>
                <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #3B6EF0, #2554D4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg width="15" height="15" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/></svg></span>
                  AI-помощник
                </span>
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>Конкретные шаги по выполнению задачи</p>
              </div>
              <button className="modal-close" aria-label="Закрыть" onClick={() => setOpen(false)}>✕</button>
            </div>

            <div style={{ background: 'linear-gradient(135deg, #f5f3ff, #E0EAFF)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, border: '1px solid #ddd6fe' }}>
              <p style={{ fontSize: 13, color: '#2554D4', fontWeight: 600, margin: 0, lineHeight: 1.4 }}>
                {task.title || task.description}
              </p>
            </div>

            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 0' }}>
                <div className="spinner" style={{ borderColor: '#ddd6fe', borderTopColor: '#3B6EF0' }} />
                <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>AI анализирует задачу...</span>
              </div>
            ) : steps ? (
              <>
                <ol style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 0, listStyle: 'none', paddingBottom: 4 }}>
                  {steps.map((step, i) => (
                    <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, #3B6EF0, #2554D4)', color: 'white', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>{i + 1}</span>
                      <span style={{ fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.6 }}>{step}</span>
                    </li>
                  ))}
                </ol>
                <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
                  <button
                    onClick={handleAdd}
                    disabled={adding || added}
                    style={{
                      flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', cursor: added ? 'default' : 'pointer',
                      background: added ? '#f0fdf4' : 'linear-gradient(135deg, #3B6EF0, #2554D4)',
                      color: added ? '#16a34a' : '#fff',
                      fontSize: 13, fontWeight: 700,
                      transition: 'all 0.2s',
                    }}
                  >
                    {added ? '✓ Добавлено!' : adding ? 'Добавление...' : '+ Добавить подзадачи'}
                  </button>
                  <button onClick={fetchSteps} style={{ padding: '9px 14px', borderRadius: 10, border: '1px solid var(--color-border)', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                    Обновить
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '16px 0' }}>
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>AI не смог обработать запрос</p>
                <button onClick={fetchSteps} style={{ background: 'linear-gradient(135deg, #3B6EF0, #2554D4)', border: 'none', borderRadius: 8, color: 'white', fontSize: 12, fontWeight: 700, padding: '7px 18px', cursor: 'pointer' }}>Повторить</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
