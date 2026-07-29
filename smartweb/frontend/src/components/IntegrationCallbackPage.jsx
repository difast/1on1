import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { completeIntegrationOAuth } from '../api/client'

/*
 * Страница OAuth-колбэка календаря: /integrations/google/callback,
 * /integrations/yandex/callback. Провайдер редиректит сюда с ?code=&state=.
 * Отправляем их на бэкенд для обмена на токены (user_id берётся из подписанного
 * state на сервере), затем возвращаем пользователя во вкладку «Интеграции».
 */
export default function IntegrationCallbackPage() {
  const { t } = useTranslation()
  const [status, setStatus] = useState('loading')  // loading | ok | error
  const [message, setMessage] = useState('')

  useEffect(() => {
    const parts = window.location.pathname.split('/').filter(Boolean)
    // /integrations/<provider>/callback
    const provider = parts[1]
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    const err = params.get('error')
    if (err || !code || !state) {
      setStatus('error')
      setMessage(err ? t('ui.podklyuchenie_otmeneno') : t('auth.missingParams'))
      return
    }
    completeIntegrationOAuth(provider, code, state)
      .then(() => setStatus('ok'))
      .catch((e) => {
        setStatus('error')
        setMessage(e?.response?.data?.detail?.message || e?.response?.data?.detail || t('ui.ne_udalos_zavershit_podklyuchenie'))
      })
  }, [])

  const goBack = () => { window.location.href = '/?integrations=1' }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'var(--font-sans)' }}>
      <div className="card" style={{ maxWidth: 420, width: '100%', padding: 32, textAlign: 'center' }}>
        <span className="logo" style={{ fontSize: 24 }}>OneOn<span className="accent">One</span></span>
        <div style={{ marginTop: 24 }}>
          {status === 'loading' && <p style={{ color: 'var(--color-text-secondary)' }}>{t('ui.zavershaem_podklyuchenie_kalendarya')}</p>}
          {status === 'ok' && (
            <>
              <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 10 }}>{t('ui.kalendar_podklyuchen')}</h2>
              <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 22 }}>{t('ui.vstrechi_budut_avtomaticheski_sinhronizirovats')}</p>
              <button onClick={goBack} className="btn btn-accent" style={{ width: '100%' }}>{t('ui.vernutsya_k_integraciyam')}</button>
            </>
          )}
          {status === 'error' && (
            <>
              <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 10 }}>{t('ui.ne_udalos_podklyuchit')}</h2>
              <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 22 }}>{message}</p>
              <button onClick={goBack} className="btn btn-accent" style={{ width: '100%' }}>{t('ui.vernutsya_k_integraciyam')}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
