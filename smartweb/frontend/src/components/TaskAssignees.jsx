import { useState } from 'react'
import TaskStatusSelect, { StatusIcon, STATUS_LABEL } from './TaskStatusSelect'
import { updateTaskAssignee } from '../api/client'
import TaskCollabModal from './TaskCollabModal'

const STATUS_COLOR = {
  in_progress: '#1d4ed8', review: '#b45309', blocked: '#dc2626', done: '#15803d',
}

/*
 * Отображение участников совместной задачи (Задача 4): часть работы каждого,
 * его статус и сводный прогресс. Обратная совместимость: компонент рисуется
 * только когда у задачи есть assignees (обычные задачи с одним ответственным
 * его не имеют и продолжают работать по-старому).
 *
 * Права: тимлид (canManageAll) может менять статус любого участника; участник —
 * только свой. Остальным статус показывается как read-only бейдж.
 */
export default function TaskAssignees({ task, currentUserId, canManageAll = false, onChanged, contacts = [] }) {
  const [busyId, setBusyId] = useState(null)
  const [showCollab, setShowCollab] = useState(false)
  const assignees = task.assignees || []
  if (assignees.length === 0) return null
  const progress = task.progress || { done: assignees.filter(a => a.completed).length, total: assignees.length, percent: 0 }

  const changeStatus = async (assignee, status) => {
    setBusyId(assignee.id)
    try {
      const { data } = await updateTaskAssignee(assignee.id, { status })
      onChanged?.(data)  // сервер возвращает всю задачу с пересчитанным прогрессом
    } catch {
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--color-border)' }}>
      {/* Сводный прогресс */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Участники
        </span>
        <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--color-bg)', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
          <div style={{ width: `${progress.percent}%`, height: '100%', background: 'linear-gradient(90deg, #22c55e, #15803d)', transition: 'width 0.3s ease' }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: progress.done === progress.total ? '#15803d' : 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
          {progress.done} из {progress.total}
        </span>
      </div>

      {/* Список участников с их частью и статусом */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {assignees.map(a => {
          const mine = a.user_id === currentUserId
          const canEdit = canManageAll || mine
          const st = a.status || 'in_progress'
          return (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0, lineHeight: 1.25 }}>
                  {a.user_name || `#${a.user_id}`}{mine ? ' (вы)' : ''}
                </p>
                {a.part_description && (
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '1px 0 0', lineHeight: 1.35 }}>
                    {a.part_description}
                  </p>
                )}
              </div>
              {canEdit ? (
                <div style={{ opacity: busyId === a.id ? 0.6 : 1, pointerEvents: busyId === a.id ? 'none' : 'auto' }}>
                  <TaskStatusSelect status={st} onChange={(s) => changeStatus(a, s)} allowDone={true} />
                </div>
              ) : (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                  color: STATUS_COLOR[st] || STATUS_COLOR.in_progress,
                  background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                }}>
                  <StatusIcon type={st} size={14} />
                  {STATUS_LABEL[st] || 'В работе'}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Совместная работа (39.2/39.3): активность, комментарии, состав */}
      <button
        onClick={() => setShowCollab(true)}
        style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--color-accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, textAlign: 'left' }}>
        Активность и комментарии
      </button>
      {showCollab && (
        <TaskCollabModal
          task={task}
          currentUser={{ id: currentUserId }}
          canManage={canManageAll}
          contacts={contacts}
          onChanged={onChanged}
          onClose={() => setShowCollab(false)}
        />
      )}
    </div>
  )
}
