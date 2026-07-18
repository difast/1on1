import { useState, useEffect } from 'react'
import { authConfirmEmail } from '../api/client'

// Страница по ссылке из письма: /confirm-email?token=...
// Проверяет токен через бэкенд и показывает результат.
export default function ConfirmEmailPage() {
  const [status, setStatus] = useState('loading') // loading | ok | error

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token')
    if (!token) { setStatus('error'); return }
    authConfirmEmail(token).then(() => setStatus('ok')).catch(() => setStatus('error'))
  }, [])

  const goApp = () => { window.location.href = '/' }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'var(--font-sans)' }}>
      <div className="card" style={{ maxWidth: 420, width: '100%', padding: 32, textAlign: 'center' }}>
        <span className="logo" style={{ fontSize: 24 }}>OneOn<span className="accent">One</span></span>
        <div style={{ marginTop: 24 }}>
          {status === 'loading' && (
            <p style={{ color: 'var(--color-text-secondary)' }}>Проверяем ссылку...</p>
          )}
          {status === 'ok' && (
            <>
              <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 10 }}>Почта подтверждена</h2>
              <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 22 }}>
                Теперь доступно оформление платной подписки.
              </p>
              <button onClick={goApp} className="btn btn-accent" style={{ width: '100%' }}>Продолжить</button>
            </>
          )}
          {status === 'error' && (
            <>
              <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 10 }}>Ссылка недействительна</h2>
              <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 22 }}>
                Возможно, она устарела или уже использована. Запросите новое письмо в приложении.
              </p>
              <button onClick={goApp} className="btn btn-accent" style={{ width: '100%' }}>Вернуться в приложение</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
