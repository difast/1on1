import { useState, useEffect } from 'react'
import { getSubtasks, updateSubtask } from '../api/client'

export default function SubtaskList({ taskId, refreshKey = 0, onAllDone }) {
  const [subtasks, setSubtasks] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getSubtasks(taskId)
      .then(({ data }) => { if (!cancelled) setSubtasks(data || []) })
      .catch(() => { if (!cancelled) setSubtasks([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [taskId, refreshKey])

  const toggle = async (subtask) => {
    const next = !subtask.completed
    const updated = subtasks.map(s => s.id === subtask.id ? { ...s, completed: next } : s)
    setSubtasks(updated)
    try {
      await updateSubtask(subtask.id, { completed: next })
      if (next && updated.every(s => s.completed)) {
        onAllDone?.()
      }
    } catch {
      setSubtasks(subtasks)
    }
  }

  if (loading) return (
    <div style={{ padding: '6px 0 2px', display: 'flex', alignItems: 'center', gap: 6 }}>
      <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2, borderColor: '#d1fae5', borderTopColor: '#22c55e' }} />
      <span style={{ fontSize: 11, color: '#6b7280' }}>Загрузка подзадач...</span>
    </div>
  )

  if (!subtasks.length) return null

  const doneCount = subtasks.filter(s => s.completed).length

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f0fdf4' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#16a34a', letterSpacing: '0.04em' }}>
          ПОДЗАДАЧИ
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700, color: doneCount === subtasks.length ? '#16a34a' : '#6b7280',
          background: doneCount === subtasks.length ? '#dcfce7' : '#f3f4f6',
          borderRadius: 20, padding: '1px 7px',
        }}>
          {doneCount}/{subtasks.length}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {subtasks.map(s => (
          <button
            key={s.id}
            onClick={() => toggle(s)}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '2px 0', textAlign: 'left', width: '100%',
            }}
          >
            <span style={{
              width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1,
              border: s.completed ? 'none' : '2px solid #22c55e',
              background: s.completed ? '#22c55e' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}>
              {s.completed && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </span>
            <span style={{
              fontSize: 12, lineHeight: 1.5,
              color: s.completed ? '#9ca3af' : '#374151',
              textDecoration: s.completed ? 'line-through' : 'none',
              transition: 'all 0.15s',
            }}>
              {s.title}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
