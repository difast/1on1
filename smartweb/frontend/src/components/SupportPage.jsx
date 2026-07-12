import { useState, useEffect, useRef } from 'react'
import { createSupportTicket, getUserTickets, userSendMessage, userReadReply } from '../api/client'
import useEscapeKey from '../lib/useEscapeKey'

function MessageBubble({ msg }) {
  const isAdmin = msg.sender === 'admin'
  return (
    <div style={{
      display: 'flex', justifyContent: isAdmin ? 'flex-start' : 'flex-end',
      marginBottom: 10,
    }}>
      <div style={{
        maxWidth: '78%', padding: '10px 14px',
        borderRadius: isAdmin ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
        background: isAdmin ? 'var(--color-surface)' : 'var(--color-accent)',
        color: isAdmin ? 'var(--color-text-primary)' : '#fff',
        fontSize: 14, lineHeight: 1.55,
        border: isAdmin ? '1px solid var(--color-border)' : 'none',
        boxShadow: 'var(--shadow-xs)',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {isAdmin && <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 4, margin: '0 0 4px' }}>Поддержка</p>}
        {msg.body}
        <p style={{ fontSize: 10, color: isAdmin ? 'var(--color-text-muted)' : 'rgba(255,255,255,0.65)', margin: '4px 0 0', textAlign: 'right' }}>
          {new Date(msg.created_at).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}

function TicketThread({ ticket, currentUser, onUpdate }) {
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    if (ticket.has_unread_reply) {
      userReadReply(ticket.id).catch(() => {})
      onUpdate(ticket.id, { has_unread_reply: false })
    }
  }, [ticket.id])

  const handleSend = async (e) => {
    e.preventDefault()
    if (!reply.trim()) return
    setSending(true)
    try {
      const { data } = await userSendMessage(ticket.id, reply.trim())
      onUpdate(ticket.id, data)
      setReply('')
    } catch { } finally { setSending(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Thread header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
        <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)', margin: 0 }}>{ticket.subject}</p>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '3px 0 0' }}>
          {new Date(ticket.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {ticket.messages.map(m => <MessageBubble key={m.id} msg={m} />)}
        <div ref={bottomRef} />
      </div>

      {/* Reply box */}
      <form onSubmit={handleSend} style={{
        padding: '12px 16px', borderTop: '1px solid var(--color-border)',
        display: 'flex', gap: 8, flexShrink: 0, background: 'var(--color-surface)',
      }}>
        <textarea
          value={reply}
          onChange={e => setReply(e.target.value)}
          placeholder="Написать сообщение..."
          rows={2}
          style={{
            flex: 1, resize: 'none', fontSize: 14, padding: '8px 12px',
            border: '1.5px solid var(--color-border)', borderRadius: 10,
            outline: 'none', fontFamily: 'var(--font-sans)', lineHeight: 1.5,
            background: 'var(--color-bg)',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--color-accent)'}
          onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e) } }}
        />
        <button type="submit" disabled={sending || !reply.trim()} className="btn btn-accent btn-sm" style={{ alignSelf: 'flex-end' }}>
          {sending ? '...' : '↑'}
        </button>
      </form>
    </div>
  )
}

export default function SupportPage({ currentUser, onClose }) {
  useEscapeKey(onClose)  // keyboard escape hatch
  const [view, setView] = useState('list') // 'list' | 'new' | 'thread'
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTicket, setActiveTicket] = useState(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getUserTickets(currentUser.id)
      .then(r => setTickets(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [currentUser.id])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!subject.trim() || !body.trim()) { setError('Заполните тему и содержание'); return }
    setSubmitting(true); setError('')
    try {
      const { data } = await createSupportTicket({ user_id: currentUser.id, subject: subject.trim(), body: body.trim() })
      setTickets(prev => [data, ...prev])
      setSent(true)
      setTimeout(() => { setSent(false); setSubject(''); setBody(''); setView('list') }, 1800)
    } catch { setError('Ошибка при отправке. Попробуйте ещё раз.') }
    finally { setSubmitting(false) }
  }

  const handleTicketUpdate = (id, updated) => {
    setTickets(prev => prev.map(t => t.id === id ? { ...t, ...updated } : t))
    if (activeTicket?.id === id) setActiveTicket(t => ({ ...t, ...updated }))
  }

  const openTicket = (ticket) => {
    setActiveTicket(ticket)
    setView('thread')
  }

  const unreadCount = tickets.filter(t => t.has_unread_reply).length

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'var(--color-bg)',
      display: 'flex', flexDirection: 'column',
      animation: 'fadeIn 0.18s ease',
    }}>
      {/* Header */}
      <div style={{
        height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-surface)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {view !== 'list' && (
            <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center' }}>
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
          )}
          <span className="logo">OneOn<span className="accent">One</span></span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)' }}>
            {view === 'new' ? '/ Новое обращение' : view === 'thread' ? `/ ${activeTicket?.subject}` : '/ Поддержка'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {view === 'list' && (
            <button onClick={() => setView('new')} className="btn btn-accent btn-sm">+ Новое обращение</button>
          )}
          <button onClick={onClose} className="btn btn-secondary btn-sm">✕ Закрыть</button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

        {/* LIST */}
        {view === 'list' && (
          <div style={{ maxWidth: 680, width: '100%', margin: '0 auto', padding: '28px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Мои обращения</h2>
              {unreadCount > 0 && <span className="badge badge-red">{unreadCount} новых ответа</span>}
            </div>

            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" /></div>
            ) : tickets.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="2" y="5" width="18" height="13" rx="2" stroke="var(--color-text-muted)" strokeWidth="1.4"/><path d="M2 8l9 6 9-6" stroke="var(--color-text-muted)" strokeWidth="1.4" strokeLinejoin="round"/></svg></div>
                <p className="empty-title">Обращений пока нет</p>
                <p className="empty-desc">Создайте первое обращение — мы ответим как можно скорее</p>
                <button onClick={() => setView('new')} className="btn btn-accent" style={{ marginTop: 20 }}>Написать в поддержку</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {tickets.map(t => (
                  <div
                    key={t.id}
                    className="card card-interactive"
                    onClick={() => openTicket(t)}
                    style={{
                      padding: '14px 18px',
                      borderLeft: t.has_unread_reply ? '3px solid var(--color-accent)' : undefined,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <p style={{ fontWeight: 700, fontSize: 14, margin: 0, color: 'var(--color-text-primary)' }}>{t.subject}</p>
                          {t.has_unread_reply && <span className="badge badge-blue" style={{ fontSize: 10 }}>Новый ответ</span>}
                        </div>
                        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
                          {t.messages?.length || 0} сообщений · {new Date(t.created_at).toLocaleDateString('ru-RU')}
                        </p>
                      </div>
                      <svg width="16" height="16" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 2 }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* NEW TICKET */}
        {view === 'new' && (
          <div style={{ maxWidth: 560, width: '100%', margin: '0 auto', padding: '28px 20px' }}>
            {sent ? (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f0fdf4', border: '2px solid #86efac', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><polyline points="5,14 11,20 23,8" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 700 }}>Обращение отправлено</h2>
                <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Возвращаем вас к списку...</p>
              </div>
            ) : (
              <>
                <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Новое обращение</h2>
                {/* User chip */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--gray-50)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '10px 14px', marginBottom: 20 }}>
                  <div className="avatar avatar-sm avatar-accent">{(currentUser?.name || '?').charAt(0).toUpperCase()}</div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{currentUser?.name}</p>
                    <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>{currentUser?.email}</p>
                  </div>
                </div>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Тема обращения</label>
                    <input className="input" placeholder="Кратко опишите суть" value={subject} onChange={e => setSubject(e.target.value)} maxLength={300} required />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Содержание</label>
                    <textarea className="input" placeholder="Подробно опишите вопрос или проблему..." value={body} onChange={e => setBody(e.target.value)} rows={6} required style={{ minHeight: 140, resize: 'vertical' }} />
                  </div>
                  {error && <p style={{ fontSize: 13, color: 'var(--color-danger)', margin: 0 }}>{error}</p>}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button type="button" onClick={() => setView('list')} className="btn btn-secondary" style={{ flex: 1 }}>Назад</button>
                    <button type="submit" disabled={submitting} className="btn btn-accent" style={{ flex: 2 }}>
                      {submitting ? 'Отправка...' : 'Отправить'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        )}

        {/* THREAD */}
        {view === 'thread' && activeTicket && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 700, width: '100%', margin: '0 auto', height: '100%' }}>
            <TicketThread
              ticket={activeTicket}
              currentUser={currentUser}
              onUpdate={handleTicketUpdate}
            />
          </div>
        )}
      </div>
    </div>
  )
}
