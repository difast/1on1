import { useState } from 'react'
import { createSupportTicket } from '../api/client'

export default function SupportPage({ currentUser, onClose }) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!subject.trim() || !body.trim()) { setError('Заполните тему и содержание'); return }
    setLoading(true); setError('')
    try {
      await createSupportTicket({ user_id: currentUser.id, subject: subject.trim(), body: body.trim() })
      setSent(true)
    } catch {
      setError('Ошибка при отправке. Попробуйте ещё раз.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,20,40,0.4)',
      backdropFilter: 'blur(6px)', zIndex: 300,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, animation: 'fadeIn 0.2s ease',
    }} onClick={onClose}>
      <div className="card" onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 500, padding: 32,
        animation: 'popIn 0.25s var(--ease-spring)',
      }}>
        {sent ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Обращение отправлено</h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 24 }}>
              Мы рассмотрим ваш запрос и свяжемся при необходимости.
            </p>
            <button onClick={onClose} className="btn btn-accent" style={{ width: '100%' }}>Закрыть</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Поддержка</h2>
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
                  Вопрос, предложение или проблема — напишите нам
                </p>
              </div>
              <button onClick={onClose} className="modal-close">✕</button>
            </div>

            {/* User info chip */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'var(--gray-50)', border: '1px solid var(--color-border)',
              borderRadius: 10, padding: '10px 14px', marginBottom: 20,
            }}>
              <div className="avatar avatar-sm avatar-accent">{(currentUser?.name || '?').charAt(0).toUpperCase()}</div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>{currentUser?.name}</p>
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>{currentUser?.email}</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Тема обращения</label>
                <input
                  className="input"
                  placeholder="Кратко опишите суть вопроса"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  maxLength={300}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Содержание</label>
                <textarea
                  className="input"
                  placeholder="Подробно опишите вашу проблему, предложение или вопрос..."
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={5}
                  required
                  style={{ minHeight: 120, resize: 'vertical' }}
                />
              </div>

              {error && (
                <p style={{ fontSize: 13, color: 'var(--color-danger)', margin: 0 }}>{error}</p>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" onClick={onClose} className="btn btn-secondary" style={{ flex: 1 }}>
                  Отмена
                </button>
                <button type="submit" disabled={loading} className="btn btn-accent" style={{ flex: 2 }}>
                  {loading ? 'Отправка...' : '📨 Отправить обращение'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
