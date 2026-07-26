import { useEffect, useState } from 'react'
import { setToken } from '../lib/auth'
import { completeYandexAuth } from '../api/client'

/*
 * Страница возврата после согласия в Yandex ID: /auth/yandex/callback.
 * Яндекс редиректит сюда с ?code=&state=. Отправляем их на бэкенд, который
 * проверяет state, обменивает код, находит/создаёт пользователя и выдаёт наш
 * JWT — тот же, что при входе по email и через Telegram. Сохраняем токен и
 * уходим в продукт: профиль уже заполнен (email, имя, аватар).
 */
export default function YandexAuthCallbackPage() {
  const [status, setStatus] = useState('loading')  // loading | error
  const [message, setMessage] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    const err = params.get('error')
    if (err || !code || !state) {
      setStatus('error')
      setMessage(err ? 'Вход через Яндекс ID отменён.' : 'Не хватает данных авторизации.')
      return
    }
    completeYandexAuth(code, state)
      .then(({ data }) => {
        if (data?.token) setToken(data.token)
        if (data?.user) localStorage.setItem('smart_user', JSON.stringify(data.user))
        // Полная перезагрузка на корень: App восстановит сессию по /auth/me и
        // сам решит, вести ли в онбординг или сразу в кабинет.
        window.location.replace('/')
      })
      .catch((e) => {
        setStatus('error')
        const detail = e?.response?.data?.detail
        setMessage(detail?.message || (typeof detail === 'string' ? detail : 'Не удалось войти через Яндекс ID.'))
      })
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'var(--font-sans)' }}>
      <div className="card" style={{ maxWidth: 420, width: '100%', padding: 32, textAlign: 'center' }}>
        <span className="logo" style={{ fontSize: 24 }}>OneOn<span className="accent">One</span></span>
        <div style={{ marginTop: 24 }}>
          {status === 'loading' && (
            <p style={{ color: 'var(--color-text-secondary)' }}>Завершаем вход через Яндекс ID...</p>
          )}
          {status === 'error' && (
            <>
              <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 10 }}>Не удалось войти</h2>
              <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 22 }}>{message}</p>
              <button onClick={() => { window.location.href = '/' }} className="btn btn-accent" style={{ width: '100%' }}>
                Вернуться ко входу
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
