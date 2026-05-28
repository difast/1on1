import { useState, useRef, useEffect } from 'react'
import { pitChat } from '../api/client'

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
  0%, 100% { box-shadow: 0 8px 28px rgba(99,102,241,0.45), 0 0 0 0 rgba(99,102,241,0); }
  50%      { box-shadow: 0 12px 36px rgba(99,102,241,0.65), 0 0 18px 4px rgba(99,102,241,0.2); }
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

export default function PitAssistant() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([{ role: 'assistant', content: GREETING }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150)
  }, [open])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return
    const newMessages = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    try {
      const { data } = await pitChat(newMessages.filter(m => m.role !== 'system'))
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Извините, что-то пошло не так. Попробуйте ещё раз.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{PIT_STYLES}</style>

      {/* ── Chat window ── */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 195, right: 24, zIndex: 9400,
          width: 340, maxHeight: 500, display: 'flex', flexDirection: 'column',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 20,
          boxShadow: '0 20px 60px rgba(0,0,0,0.22), 0 4px 16px rgba(99,102,241,0.12)',
          overflow: 'hidden',
          animation: 'pitChatIn 0.22s ease',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '13px 16px',
            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
            flexShrink: 0,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
              background: 'radial-gradient(ellipse at 38% 30%, #a5b4fc 0%, #6366f1 45%, #312e81 100%)',
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
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', margin: 0 }}>AI-ассистент · всегда на связи</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', cursor: 'pointer', width: 28, height: 28, borderRadius: 8, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >✕</button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflow: 'auto', padding: '14px 14px 4px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 6 }}>
                {m.role === 'assistant' && (
                  <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: 'radial-gradient(ellipse at 38% 30%, #a5b4fc, #4f46e5)' }} />
                )}
                <div style={{
                  maxWidth: '78%', padding: '9px 13px',
                  borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '4px 16px 16px 16px',
                  background: m.role === 'user'
                    ? 'linear-gradient(135deg, #6366f1, #4f46e5)'
                    : '#f1f5f9',
                  color: m.role === 'user' ? '#fff' : '#1e293b',
                  fontSize: 13, lineHeight: 1.55,
                  boxShadow: m.role === 'user' ? '0 2px 8px rgba(99,102,241,0.3)' : 'none',
                }}>{m.content}</div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'radial-gradient(ellipse at 38% 30%, #a5b4fc, #4f46e5)' }} />
                <div style={{ padding: '10px 14px', borderRadius: '4px 16px 16px 16px', background: '#f1f5f9' }}>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', animation: `pitTyping 1.2s ease-in-out infinite`, animationDelay: `${i * 0.22}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} style={{ height: 4 }} />
          </div>

          {/* Input */}
          <div style={{ padding: '10px 12px 12px', display: 'flex', gap: 8, borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder="Спросите Пита..."
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
                background: input.trim() && !loading ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'var(--color-border)',
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

      {/* ── 3D Character ── */}
      <div style={{ position: 'fixed', bottom: 90, right: 24, zIndex: 9350, userSelect: 'none' }}>
        {/* Shadow */}
        <div style={{
          width: 52, height: 10, borderRadius: '50%', margin: '0 auto',
          background: 'rgba(79,70,229,0.35)',
          animation: 'pitShadow 3s ease-in-out infinite',
        }} />

        {/* Body */}
        <div
          onClick={() => setOpen(o => !o)}
          title="Пит — AI-ассистент"
          style={{
            width: 62, height: 62, borderRadius: '50%', cursor: 'pointer',
            position: 'relative', marginBottom: 2,
            background: 'radial-gradient(ellipse at 36% 30%, #c7d2fe 0%, #6366f1 38%, #3730a3 68%, #1e1b4b 100%)',
            animation: 'pitFloat 3.2s ease-in-out infinite, pitGlow 3.2s ease-in-out infinite',
            transition: 'transform 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          {/* Antenna stem */}
          <div style={{
            position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
            width: 3, height: 12,
            background: 'linear-gradient(to top, #6366f1, #a5b4fc)',
            borderRadius: 3,
          }}>
            {/* Antenna tip */}
            <div style={{
              position: 'absolute', top: -5, left: '50%', transform: 'translateX(-50%)',
              width: 8, height: 8, borderRadius: '50%',
              background: '#c7d2fe',
              animation: 'pitAntenna 2s ease-in-out infinite',
            }} />
          </div>

          {/* Highlight (3D sphere illusion) */}
          <div style={{
            position: 'absolute', top: '16%', left: '18%',
            width: '34%', height: '24%',
            background: 'radial-gradient(ellipse, rgba(255,255,255,0.52) 0%, transparent 70%)',
            borderRadius: '50%', transform: 'rotate(-30deg)',
            pointerEvents: 'none',
          }} />

          {/* Left eye */}
          <div style={{
            position: 'absolute', top: '32%', left: '22%',
            width: 12, height: 12, borderRadius: '50%',
            background: '#fff',
            animation: 'pitBlink 4.5s ease-in-out infinite',
            boxShadow: '0 0 6px rgba(199,210,254,0.9)',
          }}>
            <div style={{ position: 'absolute', bottom: 2, right: 2, width: 5, height: 5, background: '#1e1b4b', borderRadius: '50%' }} />
          </div>

          {/* Right eye */}
          <div style={{
            position: 'absolute', top: '32%', right: '22%',
            width: 12, height: 12, borderRadius: '50%',
            background: '#fff',
            animation: 'pitBlink 4.5s ease-in-out infinite 0.18s',
            boxShadow: '0 0 6px rgba(199,210,254,0.9)',
          }}>
            <div style={{ position: 'absolute', bottom: 2, right: 2, width: 5, height: 5, background: '#1e1b4b', borderRadius: '50%' }} />
          </div>

          {/* Smile */}
          <div style={{
            position: 'absolute', bottom: '22%', left: '50%', transform: 'translateX(-50%)',
            width: 20, height: 9,
            borderBottom: '2.5px solid rgba(255,255,255,0.72)',
            borderRadius: '0 0 20px 20px',
          }} />
        </div>

        {/* Name label */}
        <div style={{
          textAlign: 'center', marginTop: 6,
          fontSize: 11, fontWeight: 700, color: 'var(--color-accent)',
          background: 'var(--color-surface)',
          border: '1px solid #c7d2fe',
          borderRadius: 8, padding: '2px 10px',
          boxShadow: '0 2px 8px rgba(99,102,241,0.15)',
          letterSpacing: '0.03em',
        }}>Пит</div>
      </div>
    </>
  )
}
