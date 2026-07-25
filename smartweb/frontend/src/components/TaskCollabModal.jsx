import { useState, useEffect } from 'react'
import {
  getTaskActivity, getTaskComments, addTaskComment,
  addTaskAssignee, removeTaskAssigneeById, getTask,
} from '../api/client'
import { toast } from '../lib/ui'
import Spinner from '../lib/Spinner'
import useEscapeKey from '../lib/useEscapeKey'

const ACTION_LABEL = {
  created: 'создал(а) задачу', status_changed: 'изменил(а) статус',
  assignee_added: 'добавил(а) исполнителя', assignee_removed: 'удалил(а) исполнителя',
  commented: 'оставил(а) комментарий', collab_joined: 'присоединил(ся) к работе',
}
const fmt = (iso) => iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''

/*
 * Совместная работа над задачей (39.2/39.3): состав исполнителей (тимлид может
 * добавлять/удалять), лента активности (кто что изменил), комментарии по задаче.
 * Это не чат: комментарии — структурные записи, привязанные к задаче.
 */
export default function TaskCollabModal({ task, currentUser, canManage = false, contacts = [], onChanged, onClose }) {
  useEscapeKey(onClose)
  const [tab, setTab] = useState('activity')  // activity | comments | members
  const [activity, setActivity] = useState(null)
  const [comments, setComments] = useState(null)
  const [commentText, setCommentText] = useState('')
  const [sending, setSending] = useState(false)
  const [localTask, setLocalTask] = useState(task)
  const [addUser, setAddUser] = useState('')
  const [busy, setBusy] = useState(false)

  const loadActivity = () => getTaskActivity(task.id).then(r => setActivity(r.data || [])).catch(() => setActivity([]))
  const loadComments = () => getTaskComments(task.id).then(r => setComments(r.data || [])).catch(() => setComments([]))
  const refreshTask = () => getTask(task.id).then(r => { setLocalTask(r.data); onChanged?.(r.data) }).catch(() => {})

  useEffect(() => { loadActivity(); loadComments() }, [task.id])

  const send = async () => {
    if (!commentText.trim()) return
    setSending(true)
    try {
      await addTaskComment(task.id, currentUser.id, commentText.trim())
      setCommentText(''); loadComments(); loadActivity()
    } catch { toast('Не удалось отправить комментарий', 'error') }
    finally { setSending(false) }
  }

  const assignees = localTask.assignees || []
  const assignedIds = new Set(assignees.map(a => a.user_id))
  const addable = contacts.filter(c => !assignedIds.has(c.user_id))

  const doAdd = async () => {
    if (!addUser) return
    setBusy(true)
    try {
      await addTaskAssignee(task.id, { user_id: Number(addUser), actor_id: currentUser.id })
      setAddUser(''); await refreshTask(); loadActivity()
    } catch (err) { toast(typeof err?.response?.data?.detail === 'string' ? err.response.data.detail : 'Не удалось добавить', 'error') }
    finally { setBusy(false) }
  }

  const doRemove = async (assigneeId) => {
    setBusy(true)
    try {
      await removeTaskAssigneeById(task.id, assigneeId, currentUser.id)
      await refreshTask(); loadActivity()
    } catch (err) { toast(typeof err?.response?.data?.detail === 'string' ? err.response.data.detail : 'Не удалось удалить', 'error') }
    finally { setBusy(false) }
  }

  return (
    <div className="overlay-center" onClick={onClose} style={{ zIndex: 9700 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, width: '94vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ paddingBottom: 10 }}>
          <div>
            <span className="modal-title">Совместная работа</span>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>{localTask.title}</p>
          </div>
          <button className="modal-close" aria-label="Закрыть" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {[['activity', 'Активность'], ['comments', 'Комментарии'], ['members', 'Состав']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={tab === k ? 'btn btn-accent btn-sm' : 'btn btn-secondary btn-sm'}>{l}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {tab === 'activity' && (
            activity === null ? <div style={{ textAlign: 'center', padding: 24 }}><div className="spinner" /></div> :
            activity.length === 0 ? <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', padding: 20 }}>Пока нет событий</p> :
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activity.map(a => (
                <div key={a.id} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-accent)', marginTop: 6, flexShrink: 0 }} />
                  <div>
                    <span style={{ fontWeight: 600 }}>{a.actor_name || 'Участник'}</span> <span style={{ color: 'var(--color-text-secondary)' }}>{ACTION_LABEL[a.action] || a.action}</span>
                    {a.detail && a.action !== 'created' && <span style={{ color: 'var(--color-text-muted)' }}> — {a.detail}</span>}
                    <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>{fmt(a.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'comments' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {comments === null ? <div style={{ textAlign: 'center', padding: 24 }}><div className="spinner" /></div> :
                comments.length === 0 ? <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', padding: 12 }}>Комментариев пока нет</p> :
                comments.map(c => (
                  <div key={c.id} style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '8px 12px' }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', margin: 0 }}>{c.author_name || 'Участник'} · {fmt(c.created_at)}</p>
                    <p style={{ fontSize: 13.5, color: 'var(--color-text-primary)', margin: '2px 0 0', whiteSpace: 'pre-wrap' }}>{c.body}</p>
                  </div>
                ))}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea className="input" rows={2} value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Комментарий по задаче..." style={{ flex: 1 }} />
                <button className="btn btn-accent btn-sm" disabled={sending || !commentText.trim()} onClick={send} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {sending ? <Spinner size={14} /> : 'Отправить'}
                </button>
              </div>
            </div>
          )}

          {tab === 'members' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {assignees.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 10 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>{a.user_name || `#${a.user_id}`}</p>
                    {a.part_description && <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>{a.part_description}</p>}
                  </div>
                  {canManage && (
                    <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => doRemove(a.id)}>Удалить</button>
                  )}
                </div>
              ))}
              {assignees.length === 0 && <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Один исполнитель (без совместной работы)</p>}
              {canManage && addable.length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <select className="input input-sm" value={addUser} onChange={e => setAddUser(e.target.value)} style={{ flex: 1 }}>
                    <option value="">+ Добавить исполнителя</option>
                    {addable.map(c => <option key={c.user_id} value={c.user_id}>{c.name}</option>)}
                  </select>
                  <button className="btn btn-accent btn-sm" disabled={busy || !addUser} onClick={doAdd} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {busy ? <Spinner size={14} /> : 'Добавить'}
                  </button>
                </div>
              )}
              {!canManage && <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>Изменять состав может только тимлид.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
