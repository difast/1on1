import { useState, useEffect } from 'react'
import { getTaskProposals, createTaskProposal, acceptTaskProposal, declineTaskProposal, commentTaskProposal } from '../api/client'
import { toast } from '../lib/ui'
import Spinner from '../lib/Spinner'
import useEscapeKey from '../lib/useEscapeKey'

const STATUS_LABEL = { pending: 'Ожидает ответа', discussing: 'Обсуждается', accepted: 'Принято', declined: 'Отклонено' }
const STATUS_BADGE = { pending: 'badge-amber', discussing: 'badge-blue', accepted: 'badge-green', declined: 'badge-red' }
const ACTION_LABEL = { proposed: 'предложил(а) задачу', commented: 'написал(а)', accepted: 'принял(а)', declined: 'отклонил(а)' }

const fmt = (iso) => iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
const fmtDue = (iso) => iso ? new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }) : null

/*
 * Предложения задач: отдельный от прямого создания задачи флоу с подтверждением.
 * Инициатор (любой участник) предлагает задачу, получатель принимает/отклоняет/
 * обсуждает. Реальная задача создаётся ТОЛЬКО после принятия — на бэкенде.
 * Сущность отдельная и от задачи, и от предложения встречи.
 */
export default function TaskProposals({ currentUser, contacts = [], teamId, onClose, onChanged, presetToUserId = null, initialTab = 'inbox' }) {
  useEscapeKey(onClose)
  const [proposals, setProposals] = useState(null)
  const [tab, setTab] = useState(presetToUserId ? 'new' : initialTab)  // inbox | outbox | new
  const [busyId, setBusyId] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [commentFor, setCommentFor] = useState(null)
  const [commentText, setCommentText] = useState('')

  // New proposal form
  const [toUser, setToUser] = useState(presetToUserId ? String(presetToUserId) : '')
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [due, setDue] = useState('')
  const [creating, setCreating] = useState(false)

  const load = () => {
    getTaskProposals(currentUser.id).then(r => setProposals(r.data || [])).catch(() => setProposals([]))
  }
  useEffect(() => { load() }, [currentUser.id])

  const isOpen = (p) => p.status === 'pending' || p.status === 'discussing'
  // Получатель может принять/отклонить, пока предложение открыто.
  const canRespond = (p) => isOpen(p) && p.to_user_id === currentUser.id
  const incoming = (proposals || []).filter(p => canRespond(p))
  const mine = (proposals || []).filter(p => !canRespond(p))

  const act = async (fn, id) => {
    setBusyId(id)
    try {
      await fn(id, currentUser.id)
      load(); onChanged?.()
    } catch (err) {
      const d = err?.response?.data?.detail
      toast(typeof d === 'string' ? d : 'Не удалось выполнить действие', 'error')
    } finally { setBusyId(null) }
  }

  const doAccept = (p) => act(acceptTaskProposal, p.id)
  const doDecline = (p) => act(declineTaskProposal, p.id)

  const sendComment = async (p) => {
    if (!commentText.trim()) { toast('Введите сообщение', 'error'); return }
    setBusyId(p.id)
    try {
      await commentTaskProposal(p.id, currentUser.id, commentText.trim())
      setCommentFor(null); setCommentText('')
      setExpanded(p.id)
      load(); onChanged?.()
    } catch (err) {
      const d = err?.response?.data?.detail
      toast(typeof d === 'string' ? d : 'Не удалось отправить', 'error')
    } finally { setBusyId(null) }
  }

  const submitNew = async (e) => {
    e.preventDefault()
    if (!toUser) { toast('Выберите получателя', 'error'); return }
    if (!title.trim()) { toast('Укажите название задачи', 'error'); return }
    setCreating(true)
    try {
      await createTaskProposal({
        from_user_id: currentUser.id, to_user_id: Number(toUser),
        title: title.trim(), description: desc.trim() || null,
        due_date: due || null, team_id: teamId || null,
      })
      toast('Предложение задачи отправлено', 'success')
      setTitle(''); setDesc(''); setDue('')
      if (!presetToUserId) setToUser('')
      setTab('outbox'); load(); onChanged?.()
    } catch (err) {
      const d = err?.response?.data?.detail
      toast(typeof d === 'string' ? d : 'Не удалось отправить предложение', 'error')
    } finally { setCreating(false) }
  }

  const renderCard = (p) => {
    const respond = canRespond(p)
    return (
      <div key={p.id} className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: 700, fontSize: 14, margin: 0, color: 'var(--color-text-primary)' }}>
              {p.from_user_id === currentUser.id ? `Вы -> ${p.to_user_name || 'Участник'}` : `${p.from_user_name || 'Участник'} -> вам`}
            </p>
            <p style={{ fontSize: 14, color: 'var(--color-text-primary)', margin: '4px 0 0', fontWeight: 600 }}>{p.title}</p>
            {p.description && <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '2px 0 0' }}>{p.description}</p>}
            {p.due_date && <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>Срок: {fmtDue(p.due_date)}</p>}
          </div>
          <span className={`badge ${STATUS_BADGE[p.status] || 'badge-gray'}`} style={{ flexShrink: 0 }}>
            {respond ? 'Ваш ход' : STATUS_LABEL[p.status] || p.status}
          </span>
        </div>

        {/* История обсуждения */}
        {p.events?.length > 1 && (
          <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} style={{ background: 'none', border: 'none', color: 'var(--color-accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, textAlign: 'left' }}>
            {expanded === p.id ? 'Скрыть обсуждение' : `Обсуждение (${p.events.length})`}
          </button>
        )}
        {expanded === p.id && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderLeft: '2px solid var(--color-border)', paddingLeft: 10 }}>
            {p.events.map(e => (
              <div key={e.id}>
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>
                  <b style={{ color: 'var(--color-text-secondary)' }}>{e.actor_name || 'Участник'}</b> {ACTION_LABEL[e.action] || e.action} · {fmt(e.created_at)}
                </p>
                {e.note && <p style={{ fontSize: 13, color: 'var(--color-text-primary)', margin: '1px 0 0' }}>{e.note}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Обсуждение доступно обеим сторонам, пока предложение открыто */}
        {isOpen(p) && (p.from_user_id === currentUser.id || p.to_user_id === currentUser.id) && (
          commentFor === p.id ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--color-bg)', padding: 10, borderRadius: 8 }}>
              <textarea className="input" rows={2} placeholder="Сообщение по задаче" value={commentText} onChange={e => setCommentText(e.target.value)} style={{ resize: 'none' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-accent btn-sm" style={{ flex: 1 }} disabled={busyId === p.id} onClick={() => sendComment(p)}>
                  {busyId === p.id ? <Spinner size={14} /> : 'Отправить'}
                </button>
                <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} disabled={busyId === p.id} onClick={() => { setCommentFor(null); setCommentText('') }}>Отмена</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {respond && (
                <button className="btn btn-accent btn-sm" disabled={busyId === p.id} onClick={() => doAccept(p)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {busyId === p.id ? <Spinner size={14} /> : null} Принять
                </button>
              )}
              <button className="btn btn-secondary btn-sm" disabled={busyId === p.id} onClick={() => { setCommentFor(p.id); setCommentText('') }}>Обсудить</button>
              {respond && (
                <button className="btn btn-danger btn-sm" disabled={busyId === p.id} onClick={() => doDecline(p)}>Отклонить</button>
              )}
            </div>
          )
        )}
        {p.status === 'accepted' && (
          <p style={{ fontSize: 12, color: '#15803d', margin: 0, fontWeight: 600 }}>Задача создана и назначена на {p.to_user_name || 'получателя'}</p>
        )}
        {p.status === 'declined' && (
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>Предложение отклонено</p>
        )}
      </div>
    )
  }

  return (
    <div data-pit-hide style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'var(--color-bg)', display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.18s ease' }}>
      <div style={{ height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="logo">OneOn<span className="accent">One</span></span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)' }}>/ Предложения задач</span>
        </div>
        <button onClick={onClose} className="btn btn-secondary btn-sm">Закрыть</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '12px 20px 0', maxWidth: 680, width: '100%', margin: '0 auto' }}>
        {[['inbox', `Входящие${incoming.length ? ` (${incoming.length})` : ''}`], ['outbox', 'Все'], ['new', '+ Предложить']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={tab === k ? 'btn btn-accent btn-sm' : 'btn btn-secondary btn-sm'}>{label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', maxWidth: 680, width: '100%', margin: '0 auto' }}>
        {tab === 'new' ? (
          <form onSubmit={submitNew} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Кому</label>
              <select className="input" value={toUser} onChange={e => setToUser(e.target.value)}>
                <option value="">— выберите участника —</option>
                {contacts.map(c => <option key={c.user_id} value={c.user_id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Название задачи</label>
              <input className="input" placeholder="Что нужно сделать" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Описание</label>
              <textarea className="input" rows={3} placeholder="Подробности (необязательно)" value={desc} onChange={e => setDesc(e.target.value)} style={{ resize: 'vertical' }} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Срок</label>
              <input type="date" className="input" value={due} onChange={e => setDue(e.target.value)} />
            </div>
            <button type="submit" disabled={creating} className="btn btn-accent" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {creating ? <><Spinner size={15} /> Отправка...</> : 'Отправить предложение'}
            </button>
          </form>
        ) : proposals === null ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" /></div>
        ) : (() => {
          const list = tab === 'inbox' ? incoming : mine
          if (list.length === 0) {
            return <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 14, padding: '40px 0' }}>
              {tab === 'inbox' ? 'Нет предложений, ожидающих вашего ответа' : 'Предложений пока нет'}
            </p>
          }
          return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{list.map(renderCard)}</div>
        })()}
      </div>
    </div>
  )
}
