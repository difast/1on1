import { useState, useEffect } from 'react'
import { getProposals, createProposal, acceptProposal, declineProposal, counterProposal } from '../api/client'
import { toast } from '../lib/ui'
import Spinner from '../lib/Spinner'
import useEscapeKey from '../lib/useEscapeKey'

const STATUS_LABEL = { pending: 'Ожидает ответа', accepted: 'Принято', declined: 'Отклонено' }
const STATUS_BADGE = { pending: 'badge-amber', accepted: 'badge-green', declined: 'badge-red' }
const ACTION_LABEL = { proposed: 'предложил(а) встречу', countered: 'предложил(а) другое время', accepted: 'принял(а)', declined: 'отклонил(а)' }

const fmt = (iso) => iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''

/*
 * Предложения встреч (Задача 5): отдельный от прямого создания встречи флоу с
 * подтверждением. Инициатор предлагает время, получатель принимает/отклоняет/
 * предлагает другое время (цикл переговоров). Встреча создаётся только после
 * принятия — на бэкенде.
 */
export default function MeetingProposals({ currentUser, contacts = [], teamId, onClose, onChanged, presetToUserId = null }) {
  useEscapeKey(onClose)
  const [proposals, setProposals] = useState(null)
  const [tab, setTab] = useState(presetToUserId ? 'new' : 'inbox')   // inbox | outbox | new
  const [busyId, setBusyId] = useState(null)
  const [counterFor, setCounterFor] = useState(null)   // proposal id being countered
  const [counterTime, setCounterTime] = useState('')
  const [expanded, setExpanded] = useState(null)

  // New proposal form
  const [toUser, setToUser] = useState(presetToUserId ? String(presetToUserId) : '')
  const [topic, setTopic] = useState('')
  const [when, setWhen] = useState('')
  const [creating, setCreating] = useState(false)

  const load = () => {
    getProposals(currentUser.id).then(r => setProposals(r.data || [])).catch(() => setProposals([]))
  }
  useEffect(() => { load() }, [currentUser.id])

  const awaitingMe = (p) => p.status === 'pending' && p.awaiting_user_id === currentUser.id
  // Входящие: требуют моего ответа сейчас. «Все»: вся переписка (входящие+исходящие).
  const incoming = (proposals || []).filter(p => awaitingMe(p))
  const mine = (proposals || []).filter(p => !awaitingMe(p))

  const act = async (fn, id, ...args) => {
    setBusyId(id)
    try {
      await fn(id, currentUser.id, ...args)
      load()
      onChanged?.()
    } catch (err) {
      const d = err?.response?.data?.detail
      toast(typeof d === 'string' ? d : 'Не удалось выполнить действие', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const doAccept = (p) => act(acceptProposal, p.id)
  const doDecline = (p) => act(declineProposal, p.id)
  const doCounter = async (p) => {
    if (!counterTime) { toast('Укажите новое время', 'error'); return }
    setBusyId(p.id)
    try {
      await counterProposal(p.id, currentUser.id, counterTime, undefined)
      setCounterFor(null); setCounterTime('')
      load(); onChanged?.()
    } catch (err) {
      const d = err?.response?.data?.detail
      toast(typeof d === 'string' ? d : 'Не удалось отправить', 'error')
    } finally { setBusyId(null) }
  }

  const submitNew = async (e) => {
    e.preventDefault()
    if (!toUser) { toast('Выберите получателя', 'error'); return }
    if (!when) { toast('Укажите время встречи', 'error'); return }
    setCreating(true)
    try {
      await createProposal({ from_user_id: currentUser.id, to_user_id: Number(toUser), proposed_time: when, topic: topic.trim() || null, team_id: teamId || null })
      toast('Предложение отправлено', 'success')
      setToUser(''); setTopic(''); setWhen('')
      setTab('outbox'); load(); onChanged?.()
    } catch (err) {
      const d = err?.response?.data?.detail
      toast(typeof d === 'string' ? d : 'Не удалось отправить предложение', 'error')
    } finally { setCreating(false) }
  }

  const otherName = (p) => p.from_user_id === currentUser.id ? (p.to_user_name || 'Участник') : (p.from_user_name || 'Участник')

  const renderCard = (p) => {
    const iAmAwaited = awaitingMe(p)
    return (
      <div key={p.id} className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: 700, fontSize: 14, margin: 0, color: 'var(--color-text-primary)' }}>
              {p.from_user_id === currentUser.id ? `Вы -> ${p.to_user_name || 'Участник'}` : `${p.from_user_name || 'Участник'} -> вам`}
            </p>
            {p.topic && <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '2px 0 0' }}>{p.topic}</p>}
            <p style={{ fontSize: 13, color: 'var(--color-text-primary)', margin: '4px 0 0', fontWeight: 600 }}>
              Время: {fmt(p.proposed_time)}
            </p>
          </div>
          <span className={`badge ${STATUS_BADGE[p.status] || 'badge-gray'}`} style={{ flexShrink: 0 }}>
            {iAmAwaited ? 'Ваш ход' : STATUS_LABEL[p.status] || p.status}
          </span>
        </div>

        {/* История переговоров */}
        {p.events?.length > 1 && (
          <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} style={{ background: 'none', border: 'none', color: 'var(--color-accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, textAlign: 'left' }}>
            {expanded === p.id ? 'Скрыть историю' : `История (${p.events.length})`}
          </button>
        )}
        {expanded === p.id && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderLeft: '2px solid var(--color-border)', paddingLeft: 10 }}>
            {p.events.map(e => (
              <p key={e.id} style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>
                <b style={{ color: 'var(--color-text-secondary)' }}>{e.actor_name || 'Участник'}</b> {ACTION_LABEL[e.action] || e.action}
                {e.proposed_time ? ` (${fmt(e.proposed_time)})` : ''} · {fmt(e.created_at)}
              </p>
            ))}
          </div>
        )}

        {/* Действия — только когда ход за мной */}
        {iAmAwaited && (
          counterFor === p.id ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--color-bg)', padding: 10, borderRadius: 8 }}>
              <label className="form-label" style={{ margin: 0 }}>Предложить другое время</label>
              <input type="datetime-local" className="input input-sm" value={counterTime} onChange={e => setCounterTime(e.target.value)} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} disabled={busyId === p.id} onClick={() => { setCounterFor(null); setCounterTime('') }}>Отмена</button>
                <button className="btn btn-accent btn-sm" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} disabled={busyId === p.id} onClick={() => doCounter(p)}>
                  {busyId === p.id ? <Spinner size={14} /> : 'Отправить'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-accent btn-sm" disabled={busyId === p.id} onClick={() => doAccept(p)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {busyId === p.id ? <Spinner size={14} /> : null} Принять
              </button>
              <button className="btn btn-secondary btn-sm" disabled={busyId === p.id} onClick={() => { setCounterFor(p.id); setCounterTime('') }}>Другое время</button>
              <button className="btn btn-danger btn-sm" disabled={busyId === p.id} onClick={() => doDecline(p)}>Отклонить</button>
            </div>
          )
        )}
        {p.status === 'accepted' && (
          <p style={{ fontSize: 12, color: '#15803d', margin: 0, fontWeight: 600 }}>Встреча создана на {fmt(p.proposed_time)}</p>
        )}
        {p.status === 'pending' && !iAmAwaited && (
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>Ожидаем ответа: {otherName(p)}</p>
        )}
      </div>
    )
  }

  return (
    <div data-pit-hide style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'var(--color-bg)', display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.18s ease' }}>
      {/* Header */}
      <div style={{ height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="logo">OneOn<span className="accent">One</span></span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)' }}>/ Предложения встреч</span>
        </div>
        <button onClick={onClose} className="btn btn-secondary btn-sm">Закрыть</button>
      </div>

      {/* Tabs */}
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
              <label className="form-label">Тема</label>
              <input className="input" placeholder="О чём встреча" value={topic} onChange={e => setTopic(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Предлагаемое время</label>
              <input type="datetime-local" className="input" value={when} onChange={e => setWhen(e.target.value)} />
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
