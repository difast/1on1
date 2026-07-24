import { useState, useRef, useEffect, useCallback } from 'react'
import { pitChat, createSupportTicket, getUserTickets, userSendMessage, userReadReply } from '../api/client'
import { buildPitContext, parsePitActions, executePitAction } from '../lib/pit'
import useEscapeKey from '../lib/useEscapeKey'
import useStickyScroll from '../lib/useStickyScroll'
import { parseFeatureLock, openPricing } from '../lib/featureLock'
import { useExclusiveOverlay } from '../lib/overlay'
import { useIsTelegram } from '../lib/surface'

const PIT_STYLES = `
@keyframes pitFloat {
  0%, 100% { transform: translateY(0px) rotate(-1.5deg); }
  50%       { transform: translateY(-10px) rotate(1.5deg); }
}
@keyframes pitBlink {
  0%, 88%, 100% { transform: scaleY(1); }
  93%           { transform: scaleY(0.08); }
}
@keyframes pitShadow {
  0%, 100% { transform: scaleX(1); opacity: 0.28; }
  50%      { transform: scaleX(0.65); opacity: 0.12; }
}
@keyframes pitGlow {
  0%, 100% { box-shadow: 0 8px 28px rgba(37,84,212,0.45), 0 0 0 0 rgba(37,84,212,0); }
  50%      { box-shadow: 0 12px 36px rgba(37,84,212,0.65), 0 0 18px 4px rgba(37,84,212,0.2); }
}
@keyframes pitAntenna {
  0%, 100% { box-shadow: 0 0 6px 2px rgba(165,180,252,0.7); }
  50%      { box-shadow: 0 0 12px 4px rgba(165,180,252,1); }
}
@keyframes pitTyping {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30%           { transform: translateY(-5px); opacity: 1; }
}
@keyframes pitChatIn {
  from { opacity: 0; transform: translateY(16px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
`

const GREETING = 'Привет! Я Пит — ваш AI-ассистент OneOnOne. Помогу с вопросами о встречах, задачах и команде. Спрашивайте!'

function readCurrentUser() {
  try { return JSON.parse(localStorage.getItem('smart_user') || 'null') } catch { return null }
}

export default function PitAssistant() {
  const currentUser = readCurrentUser()
  // Mini App: та же функция Пита, но иконка-триггер заметно компактнее, а окно
  // чата вписывается в узкий вьюпорт (только визуальные правки, surface).
  const isTg = useIsTelegram()
  const [open, setOpen] = useState(false)
  // Прячем иконку Пита, когда поверх появляется любое окно: модалка
  // (.overlay-center) или полноэкранная страница/панель (data-pit-hide).
  // Тур не в счёт — он сам подсвечивает Пита.
  const [covered, setCovered] = useState(false)
  useEffect(() => {
    const check = () => setCovered(!!document.querySelector('.overlay-center, [data-pit-hide]'))
    check()
    const obs = new MutationObserver(check)
    obs.observe(document.body, { childList: true, subtree: true })
    return () => obs.disconnect()
  }, [])
  const [messages, setMessages] = useState([{ role: 'assistant', content: GREETING }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [shifted, setShifted] = useState(false)
  // Режим Пита: обычный чат или обращение в поддержку (переиспользуем систему
  // поддержки — createSupportTicket / userSendMessage, без второй системы).
  const [mode, setMode] = useState('chat')
  const [tickets, setTickets] = useState([])
  const [activeTicketId, setActiveTicketId] = useState(null)

  const loadTickets = useCallback(async () => {
    if (!currentUser?.id) return
    try {
      const { data } = await getUserTickets(currentUser.id)
      setTickets(data || [])
      // отметить ответы прочитанными при открытии
      ;(data || []).filter(t => t.has_unread_reply).forEach(t => userReadReply(t.id).catch(() => {}))
    } catch { /* ignore */ }
  }, [currentUser?.id])

  useEffect(() => { if (open && mode === 'support') loadTickets() }, [open, mode, loadTickets])
  // Умный автоскролл: доскроллить к новому сообщению только если пользователь
  // уже был у нижнего края (не выдёргиваем его, если он листает историю).
  const { scrollRef, bottomRef, onScroll } = useStickyScroll([messages, loading])
  const inputRef = useRef(null)
  const ctxRef = useRef(null)
  useEscapeKey(() => setOpen(false), open)  // keyboard escape hatch

  useEffect(() => {
    const handler = (e) => setShifted(e.detail.open)
    window.addEventListener('quickwidget-toggle', handler)
    return () => window.removeEventListener('quickwidget-toggle', handler)
  }, [])

  // Триггер Пита теперь — компактная кнопка рядом с кнопкой даты (QuickWidget),
  // а не плавающий блок. Открытие/закрытие — по событию 'pit-toggle'.
  useEffect(() => {
    const toggle = () => setOpen(o => !o)
    window.addEventListener('pit-toggle', toggle)
    return () => window.removeEventListener('pit-toggle', toggle)
  }, [])

  // Общий механизм взаимного исключения оверлеев (Задача 1): открытие окна Пита
  // закрывает меню/панели, и наоборот.
  useExclusiveOverlay('pit', open, () => setOpen(false))

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150)
  }, [open])

  const submitSupport = async () => {
    const text = input.trim()
    if (!text || loading || !currentUser?.id) return
    setLoading(true)
    try {
      if (activeTicketId) {
        const { data } = await userSendMessage(activeTicketId, text)
        setTickets(prev => prev.map(t => t.id === data.id ? data : t))
      } else {
        const subject = text.length > 60 ? text.slice(0, 57) + '…' : text
        const { data } = await createSupportTicket({ user_id: currentUser.id, subject, body: text })
        setTickets(prev => [data, ...prev])
        setActiveTicketId(data.id)
      }
      setInput('')
    } catch (err) {
      const detail = err?.response?.data?.detail
      alert(typeof detail === 'string' ? detail : 'Не удалось отправить обращение')
    } finally { setLoading(false) }
  }

  const handleSend = async () => {
    if (mode === 'support') return submitSupport()
    const text = input.trim()
    if (!text || loading) return
    const newMessages = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    try {
      // Контекст для модели теперь собирает БЭКЕНД (общий AI-слой с проверкой
      // прав). Клиент больше НЕ строит тяжёлый контекст перед каждым запросом —
      // это убирает N сетевых обращений до ответа Пита (ускорение).
      const { data } = await pitChat(newMessages.filter(m => m.role !== 'system'), '', currentUser?.id)
      const rawReply = data.reply || 'Нет ответа'

      const { clean, actions } = parsePitActions(rawReply)
      let reply = clean || rawReply
      if (actions.length && currentUser) {
        // Карту участников для выполнения действий строим ЛЕНИВО — только когда
        // Пит вернул действие (создать задачу/встречу).
        if (!ctxRef.current) ctxRef.current = await buildPitContext(currentUser)
        const results = await Promise.all(
          actions.map(a => executePitAction(a, ctxRef.current, currentUser)),
        )
        reply = [clean, ...results].filter(Boolean).join('\n\n')
      }
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch (err) {
      // Недоступно по тарифу (Задача 3) -> мягкое сообщение, а не техошибка.
      const fl = parseFeatureLock(err)
      if (fl) {
        setMessages(prev => [...prev, { role: 'assistant', content: fl.message, locked: true }])
      } else {
        const detail = err?.response?.data?.detail
        const text = (detail && typeof detail === 'string') ? detail : (err?.message || 'неизвестная ошибка')
        setMessages(prev => [...prev, { role: 'assistant', content: `Не удалось получить ответ. ${text}` }])
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{PIT_STYLES}</style>

      {/* ── Chat window ── */}
      {open && !covered && (
        <div style={{
          position: 'fixed', bottom: isTg ? 84 : 96, right: isTg ? 12 : 24, zIndex: 9400,
          width: isTg ? 'calc(100vw - 24px)' : 340, maxWidth: 340,
          maxHeight: isTg ? '68vh' : 500, display: 'flex', flexDirection: 'column',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 20,
          boxShadow: '0 20px 60px rgba(0,0,0,0.22), 0 4px 16px rgba(37,84,212,0.12)',
          overflow: 'hidden',
          animation: 'pitChatIn 0.22s ease',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '13px 16px',
            background: 'linear-gradient(135deg, #4f46e5 0%, #2554D4 100%)',
            flexShrink: 0,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
              background: 'radial-gradient(ellipse at 38% 30%, #a5b4fc 0%, #2554D4 45%, #312e81 100%)',
              border: '2px solid rgba(255,255,255,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 700, fontSize: 14, color: '#fff', margin: 0, lineHeight: 1.2 }}>Пит</p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', margin: 0 }}>{mode === 'support' ? 'Обращение в поддержку' : 'AI-ассистент · всегда на связи'}</p>
            </div>
            <button
              onClick={() => { setMode(m => m === 'support' ? 'chat' : 'support'); setActiveTicketId(null) }}
              title={mode === 'support' ? 'Вернуться к чату' : 'Обратиться в поддержку'}
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', cursor: 'pointer', height: 28, padding: '0 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', flexShrink: 0 }}
            >{mode === 'support' ? 'Чат' : 'Поддержка'}</button>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', cursor: 'pointer', width: 28, height: 28, borderRadius: 8, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >✕</button>
          </div>

          {/* Support panel */}
          {mode === 'support' && (
            <div style={{ flex: 1, overflow: 'auto', padding: '14px 14px 4px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={() => setActiveTicketId(null)} style={{ fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 8, border: `1px solid ${activeTicketId === null ? '#2554D4' : '#e2e8f0'}`, background: activeTicketId === null ? '#eff6ff' : '#fff', color: activeTicketId === null ? '#2554D4' : '#475569', cursor: 'pointer' }}>Новое обращение</button>
                {tickets.map(t => (
                  <button key={t.id} onClick={() => setActiveTicketId(t.id)} style={{ fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 8, border: `1px solid ${activeTicketId === t.id ? '#2554D4' : '#e2e8f0'}`, background: activeTicketId === t.id ? '#eff6ff' : '#fff', color: activeTicketId === t.id ? '#2554D4' : '#475569', cursor: 'pointer', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.subject}{t.has_unread_reply ? ' •' : ''}
                  </button>
                ))}
              </div>
              {activeTicketId === null ? (
                <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>Опишите проблему в поле ниже и отправьте — обращение попадёт в поддержку. Ответ придёт сюда же.</p>
              ) : (() => {
                const t = tickets.find(x => x.id === activeTicketId)
                if (!t) return null
                const thread = [{ sender: 'user', body: t.body, created_at: t.created_at }, ...(t.messages || [])]
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {thread.map((m, i) => (
                      <div key={i} style={{ alignSelf: m.sender === 'admin' ? 'flex-start' : 'flex-end', maxWidth: '85%', background: m.sender === 'admin' ? '#f1f5f9' : 'linear-gradient(135deg, #2554D4, #4f46e5)', color: m.sender === 'admin' ? '#1e293b' : '#fff', borderRadius: 12, padding: '8px 12px', fontSize: 13 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.7, marginBottom: 2 }}>{m.sender === 'admin' ? 'Поддержка' : 'Вы'}</div>
                        {m.body}
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          )}

          {/* Messages */}
          {mode !== 'support' && (
          <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, overflow: 'auto', padding: '14px 14px 4px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 6 }}>
                {m.role === 'assistant' && (
                  <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: 'radial-gradient(ellipse at 38% 30%, #a5b4fc, #4f46e5)' }} />
                )}
                <div style={{
                  maxWidth: '78%', padding: '9px 13px',
                  borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '4px 16px 16px 16px',
                  background: m.role === 'user'
                    ? 'linear-gradient(135deg, #2554D4, #4f46e5)'
                    : '#f1f5f9',
                  color: m.role === 'user' ? '#fff' : '#1e293b',
                  fontSize: 13, lineHeight: 1.55,
                  boxShadow: m.role === 'user' ? '0 2px 8px rgba(37,84,212,0.3)' : 'none',
                }}>
                  {m.content}
                  {m.locked && (
                    <button onClick={() => openPricing('start')} style={{ display: 'block', marginTop: 8, background: 'linear-gradient(135deg, #2554D4, #4f46e5)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, padding: '6px 12px', cursor: 'pointer' }}>
                      Посмотреть тарифы
                    </button>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'radial-gradient(ellipse at 38% 30%, #a5b4fc, #4f46e5)' }} />
                <div style={{ padding: '10px 14px', borderRadius: '4px 16px 16px 16px', background: '#f1f5f9' }}>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#2554D4', animation: `pitTyping 1.2s ease-in-out infinite`, animationDelay: `${i * 0.22}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} style={{ height: 4 }} />
          </div>
          )}

          {/* Input */}
          <div style={{ padding: '10px 12px 12px', display: 'flex', gap: 8, borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder={mode === 'support' ? (activeTicketId ? 'Ваш ответ в поддержку...' : 'Опишите проблему...') : 'Спросите Пита...'}
              disabled={loading}
              style={{
                flex: 1, padding: '9px 13px', borderRadius: 12,
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                color: '#1e293b',
                fontSize: 13, outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              style={{
                width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                background: input.trim() && !loading ? 'linear-gradient(135deg, #2554D4, #4f46e5)' : 'var(--color-border)',
                border: 'none', cursor: input.trim() && !loading ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.2s',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M14.5 8L1.5 1.5l2.8 6.5-2.8 6.5z" fill="white" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Компактный триггер в Mini App (в вебе кнопка Пита живёт в ряду с кнопкой
          даты — QuickWidget). Открытие — общий обработчик 'pit-toggle'. */}
      {isTg && !covered && (
        <button
          data-tour="pit"
          onClick={() => setOpen(o => !o)}
          title="Пит — AI-ассистент"
          style={{
            position: 'fixed', bottom: 74, right: 12, zIndex: 9350,
            width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #2554D4, #4f46e5)',
            boxShadow: '0 4px 16px rgba(37,84,212,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}
        >
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />
        </button>
      )}
    </>
  )
}

// Компактная кнопка-триггер Пита для веб-интерфейса: ставится СЛЕВА от кнопки
// даты (QuickWidget), на той же горизонтальной линии внизу справа. Иконка и
// размер согласованы с кнопкой даты.
export function PitTriggerButton() {
  return (
    <button
      data-tour="pit"
      onClick={() => { try { window.dispatchEvent(new Event('pit-toggle')) } catch {} }}
      title="Пит — AI-ассистент"
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--color-surface)', color: 'var(--color-accent)',
        border: '1px solid #c7d2fe', borderRadius: 32,
        padding: '10px 16px 10px 14px', cursor: 'pointer',
        boxShadow: '0 4px 16px rgba(37,84,212,0.14)',
        fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap',
      }}
    >
      <span style={{
        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
        background: 'radial-gradient(ellipse at 38% 30%, #a5b4fc 0%, #2554D4 60%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
      }}>
        <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#fff' }} />
        <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#fff' }} />
      </span>
      Пит
    </button>
  )
}
