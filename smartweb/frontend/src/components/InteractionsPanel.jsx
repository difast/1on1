import { useState, useEffect } from 'react'
import {
  getInteractions, createInteraction, acceptInteraction, declineInteraction,
  replyInteraction, closeInteraction,
} from '../api/client'
import { toast } from '../lib/ui'
import Spinner from '../lib/Spinner'
import useEscapeKey from '../lib/useEscapeKey'

/*
 * Единая точка входа взаимодействий (блок 39): лента входящих/исходящих
 * предложений совместной работы, помощи, консультаций, обсуждений, рекомендаций.
 * Всё — структурные записи со статусом, НЕ чат.
 */
const TYPE_LABEL = {
  collab_proposal: 'Совместная работа',
  help_offer: 'Предложение помощи',
  consultation: 'Консультация',
  discussion: 'Обсуждение',
  recommendation: 'Рекомендация',
}
const STATUS_LABEL = { sent: 'Отправлено', accepted: 'Принято', declined: 'Отклонено', completed: 'Завершено', closed: 'Закрыто' }
const STATUS_BADGE = { sent: 'badge-amber', accepted: 'badge-green', completed: 'badge-green', declined: 'badge-red', closed: 'badge-gray' }
const OUTCOME_LABEL = { decision: 'Решение принято', needs_meeting: 'Нужна встреча', closed: 'Закрыто без решения' }
const fmt = (iso) => iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''

export default function InteractionsPanel({ currentUser, contacts = [], tasks = [], teamId, onClose, onChanged }) {
  useEscapeKey(onClose)
  const [items, setItems] = useState(null)
  const [tab, setTab] = useState('inbox')       // inbox | all | new
  const [busyId, setBusyId] = useState(null)
  const [replyFor, setReplyFor] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [expanded, setExpanded] = useState(null)

  // Create form
  const [ntype, setNtype] = useState('collab_proposal')
  const [toUser, setToUser] = useState('')
  const [participants, setParticipants] = useState([])
  const [subjectUser, setSubjectUser] = useState('')
  const [topic, setTopic] = useState('')
  const [context, setContext] = useState('')
  const [format, setFormat] = useState('text')
  const [taskId, setTaskId] = useState('')
  const [creating, setCreating] = useState(false)

  const load = () => getInteractions(currentUser.id).then(r => setItems(r.data || [])).catch(() => setItems([]))
  useEffect(() => { load() }, [currentUser.id])

  const isRecipient = (it) => it.to_user_id === currentUser.id || (it.participants || []).some(p => p.user_id === currentUser.id && p.role !== 'initiator')
  const awaitingMe = (it) => it.status === 'sent' && it.to_user_id === currentUser.id && it.type !== 'recommendation'
  const incoming = (items || []).filter(awaitingMe)
  const all = items || []

  const act = async (fn, id, ...args) => {
    setBusyId(id)
    try { await fn(id, currentUser.id, ...args); load(); onChanged?.() }
    catch (err) { toast(typeof err?.response?.data?.detail === 'string' ? err.response.data.detail : 'Не удалось выполнить', 'error') }
    finally { setBusyId(null) }
  }

  const doReply = async (it) => {
    if (!replyText.trim()) return
    setBusyId(it.id)
    try {
      await replyInteraction(it.id, currentUser.id, replyText.trim())
      setReplyFor(null); setReplyText(''); load(); onChanged?.()
    } catch { toast('Не удалось отправить ответ', 'error') }
    finally { setBusyId(null) }
  }

  const submitNew = async (e) => {
    e.preventDefault()
    if (ntype === 'recommendation' && !subjectUser) { toast('Выберите, кого рекомендуете', 'error'); return }
    if (ntype === 'discussion' && participants.length === 0) { toast('Выберите участников обсуждения', 'error'); return }
    if (['collab_proposal', 'help_offer', 'consultation'].includes(ntype) && !toUser) { toast('Выберите получателя', 'error'); return }
    if (!topic.trim()) { toast('Укажите тему', 'error'); return }
    setCreating(true)
    try {
      await createInteraction({
        type: ntype, from_user_id: currentUser.id, team_id: teamId || null,
        to_user_id: ['collab_proposal', 'help_offer', 'consultation', 'recommendation'].includes(ntype) && toUser ? Number(toUser) : null,
        participant_ids: ntype === 'discussion' ? participants.map(Number) : null,
        subject_user_id: ntype === 'recommendation' ? Number(subjectUser) : null,
        task_id: ['collab_proposal', 'help_offer'].includes(ntype) && taskId ? Number(taskId) : null,
        topic: topic.trim(), context: context.trim() || null,
        desired_format: ntype === 'consultation' ? format : null,
      })
      toast('Взаимодействие создано', 'success')
      setTopic(''); setContext(''); setToUser(''); setParticipants([]); setSubjectUser(''); setTaskId('')
      setTab('all'); load(); onChanged?.()
    } catch (err) { toast(typeof err?.response?.data?.detail === 'string' ? err.response.data.detail : 'Не удалось создать', 'error') }
    finally { setCreating(false) }
  }

  const otherLabel = (it) => it.from_user_id === currentUser.id
    ? `Вы -> ${it.to_user_name || (it.type === 'discussion' ? `${it.participants?.length || 0} участн.` : it.subject_user_name || '')}`
    : `${it.from_user_name || 'Участник'} -> ${it.type === 'discussion' ? 'обсуждение' : it.type === 'recommendation' ? (it.subject_user_name || '') : 'вам'}`

  const canReply = (it) => ['discussion', 'consultation'].includes(it.type) &&
    (it.from_user_id === currentUser.id || it.to_user_id === currentUser.id || (it.participants || []).some(p => p.user_id === currentUser.id))

  const renderCard = (it) => (
    <div key={it.id} className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-accent)' }}>{TYPE_LABEL[it.type] || it.type}</span>
          <p style={{ fontWeight: 700, fontSize: 14, margin: '2px 0 0', color: 'var(--color-text-primary)' }}>{it.topic || '(без темы)'}</p>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '2px 0 0' }}>{otherLabel(it)}</p>
          {it.context && <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>{it.context}</p>}
          {it.desired_format && <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '2px 0 0' }}>Формат: {it.desired_format === 'call' ? 'созвон' : 'письменный ответ'}</p>}
          {it.outcome && <p style={{ fontSize: 12, color: '#15803d', margin: '2px 0 0', fontWeight: 600 }}>Итог: {OUTCOME_LABEL[it.outcome] || it.outcome}</p>}
        </div>
        <span className={`badge ${STATUS_BADGE[it.status] || 'badge-gray'}`} style={{ flexShrink: 0 }}>
          {awaitingMe(it) ? 'Ваш ход' : (STATUS_LABEL[it.status] || it.status)}
        </span>
      </div>

      {/* Тред реплик (структурный, не чат) */}
      {it.replies?.length > 0 && (
        <>
          <button onClick={() => setExpanded(expanded === it.id ? null : it.id)} style={{ background: 'none', border: 'none', color: 'var(--color-accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, textAlign: 'left' }}>
            {expanded === it.id ? 'Скрыть ответы' : `Ответы (${it.replies.length})`}
          </button>
          {expanded === it.id && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderLeft: '2px solid var(--color-border)', paddingLeft: 10 }}>
              {it.replies.map(r => (
                <div key={r.id}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', margin: 0 }}>{r.author_name || 'Участник'} · {fmt(r.created_at)}</p>
                  <p style={{ fontSize: 13, color: 'var(--color-text-primary)', margin: '1px 0 0', whiteSpace: 'pre-wrap' }}>{r.body}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Действия */}
      {awaitingMe(it) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {it.type !== 'discussion' && (
            <>
              <button className="btn btn-accent btn-sm" disabled={busyId === it.id} onClick={() => act(acceptInteraction, it.id)}>Принять</button>
              <button className="btn btn-danger btn-sm" disabled={busyId === it.id} onClick={() => act(declineInteraction, it.id)}>Отклонить</button>
            </>
          )}
        </div>
      )}
      {canReply(it) && it.status !== 'declined' && (
        replyFor === it.id ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea className="input" rows={2} value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Ваш ответ..." />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => { setReplyFor(null); setReplyText('') }}>Отмена</button>
              <button className="btn btn-accent btn-sm" disabled={busyId === it.id} onClick={() => doReply(it)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {busyId === it.id ? <Spinner size={14} /> : null} Ответить
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { setReplyFor(it.id); setReplyText('') }}>Ответить</button>
            {it.type === 'discussion' && it.from_user_id === currentUser.id && it.status !== 'completed' && (
              <>
                <button className="btn btn-accent btn-sm" disabled={busyId === it.id} onClick={() => act(closeInteraction, it.id, 'decision')}>Решение принято</button>
                <button className="btn btn-secondary btn-sm" disabled={busyId === it.id} onClick={() => act(closeInteraction, it.id, 'needs_meeting')}>Нужна встреча</button>
              </>
            )}
          </div>
        )
      )}
    </div>
  )

  const needsRecipient = ['collab_proposal', 'help_offer', 'consultation'].includes(ntype)
  const isRecommend = ntype === 'recommendation'
  const isDiscussion = ntype === 'discussion'

  return (
    <div data-pit-hide style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'var(--color-bg)', display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.18s ease' }}>
      <div style={{ height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="logo">OneOn<span className="accent">One</span></span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)' }}>/ Взаимодействия</span>
        </div>
        <button onClick={onClose} className="btn btn-secondary btn-sm">Закрыть</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '12px 20px 0', maxWidth: 720, width: '100%', margin: '0 auto' }}>
        {[['inbox', `Входящие${incoming.length ? ` (${incoming.length})` : ''}`], ['all', 'Все'], ['new', '+ Создать']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={tab === k ? 'btn btn-accent btn-sm' : 'btn btn-secondary btn-sm'}>{label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', maxWidth: 720, width: '100%', margin: '0 auto' }}>
        {tab === 'new' ? (
          <form onSubmit={submitNew} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Тип взаимодействия</label>
              <select className="input" value={ntype} onChange={e => setNtype(e.target.value)}>
                {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {needsRecipient && (
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Получатель</label>
                <select className="input" value={toUser} onChange={e => setToUser(e.target.value)}>
                  <option value="">— выберите —</option>
                  {contacts.map(c => <option key={c.user_id} value={c.user_id}>{c.name}</option>)}
                </select>
              </div>
            )}
            {isRecommend && (
              <>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Кого рекомендуете (эксперт)</label>
                  <select className="input" value={subjectUser} onChange={e => setSubjectUser(e.target.value)}>
                    <option value="">— выберите —</option>
                    {contacts.map(c => <option key={c.user_id} value={c.user_id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Кому рекомендуете (необязательно)</label>
                  <select className="input" value={toUser} onChange={e => setToUser(e.target.value)}>
                    <option value="">— вся команда увидит в профиле —</option>
                    {contacts.map(c => <option key={c.user_id} value={c.user_id}>{c.name}</option>)}
                  </select>
                </div>
              </>
            )}
            {isDiscussion && (
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Участники обсуждения</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                  {contacts.map(c => (
                    <label key={c.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', background: participants.includes(String(c.user_id)) ? 'var(--blue-50)' : 'var(--color-bg)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={participants.includes(String(c.user_id))} onChange={() => setParticipants(p => p.includes(String(c.user_id)) ? p.filter(x => x !== String(c.user_id)) : [...p, String(c.user_id)])} />
                      <span style={{ fontSize: 13.5 }}>{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {['collab_proposal', 'help_offer'].includes(ntype) && tasks.length > 0 && (
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Связать с задачей {ntype === 'collab_proposal' ? '(обязательно для совместной работы)' : '(необязательно)'}</label>
                <select className="input" value={taskId} onChange={e => setTaskId(e.target.value)}>
                  <option value="">— без задачи —</option>
                  {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              </div>
            )}
            {ntype === 'consultation' && (
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Желаемый формат</label>
                <select className="input" value={format} onChange={e => setFormat(e.target.value)}>
                  <option value="text">Письменный ответ</option>
                  <option value="call">Созвон</option>
                </select>
              </div>
            )}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Тема</label>
              <input className="input" value={topic} onChange={e => setTopic(e.target.value)} placeholder="Кратко о сути" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Контекст (необязательно)</label>
              <textarea className="input" rows={3} value={context} onChange={e => setContext(e.target.value)} placeholder="Подробности" />
            </div>
            <button type="submit" disabled={creating} className="btn btn-accent" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {creating ? <><Spinner size={15} /> Отправка...</> : 'Создать'}
            </button>
          </form>
        ) : items === null ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" /></div>
        ) : (() => {
          const list = tab === 'inbox' ? incoming : all
          if (list.length === 0) return <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 14, padding: '40px 0' }}>{tab === 'inbox' ? 'Нет входящих, ожидающих ответа' : 'Взаимодействий пока нет'}</p>
          return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{list.map(renderCard)}</div>
        })()}
      </div>
    </div>
  )
}
