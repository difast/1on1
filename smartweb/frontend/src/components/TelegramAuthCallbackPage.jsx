import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { setToken } from '../lib/auth'
import TelegramLoginButton from './TelegramLoginButton'
import { getTelegramConfig, telegramCallback } from '../api/client'

/*
 * Страница /auth/telegram/callback — веб-мост входа через Telegram для
 * мобильного приложения. Login Widget работает только в браузере, поэтому
 * приложение открывает этот адрес с меткой ?platform=mobile во внешнем браузере.
 *
 * Здесь рендерится официальный Telegram Login Widget. После подтверждения в
 * Telegram виджет отдаёт подписанные данные, мы шлём их на общий с вебом
 * /telegram/callback (там проверяется hash, находится/создаётся пользователь по
 * telegram_id и выдаётся наш JWT — та же логика, что у входа через бота/Mini App
 * и у веб-входа через Telegram). Затем перебрасываем результат в приложение по
 * deep-link oneonone://auth/telegram/callback?token=...&status=..., который ловит
 * экран app/(auth)/auth/telegram/callback.tsx.
 *
 * На вебе основной вход через Telegram идёт НЕ здесь, а прямо на странице входа
 * (виджет в AuthPage). Эта страница нужна для приложения; веб-случай обработан
 * как запасной (сохраняем сессию и уходим в кабинет).
 */
export default function TelegramAuthCallbackPage() {
  const { t } = useTranslation()
  const [status, setStatus] = useState('loading')  // loading | widget | toApp | error
  const [message, setMessage] = useState('')
  const [cfg, setCfg] = useState(null)
  const [appLink, setAppLink] = useState('')

  const params = new URLSearchParams(window.location.search)
  const isMobile = (params.get('platform') || '') === 'mobile'

  useEffect(() => {
    getTelegramConfig()
      .then(({ data }) => {
        if (!data?.enabled || !data?.bot_username) {
          setStatus('error'); setMessage(t('auth.telegramFailed')); return
        }
        setCfg(data); setStatus('widget')
      })
      .catch(() => { setStatus('error'); setMessage(t('auth.telegramFailed')) })
  }, [])

  const handleAuth = async (tgUser) => {
    setStatus('loading')
    try {
      const { data } = await telegramCallback(tgUser)
      if (isMobile) {
        const base = cfg?.mobile_redirect || 'oneonone://auth/telegram/callback'
        const target = `${base}?token=${encodeURIComponent(data?.token || '')}&status=${encodeURIComponent(data?.status || '')}`
        setAppLink(target); setStatus('toApp')
        window.location.href = target
        return
      }
      if (data?.token) setToken(data.token)
      if (data?.user) localStorage.setItem('smart_user', JSON.stringify(data.user))
      window.location.replace('/')
    } catch (err) {
      const detail = err?.response?.data?.detail
      setStatus('error')
      setMessage(detail?.message || (typeof detail === 'string' ? detail : t('auth.telegramFailed')))
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'var(--font-sans)' }}>
      <div className="card" style={{ maxWidth: 420, width: '100%', padding: 28, textAlign: 'center' }}>
        <span className="logo" style={{ fontSize: 24 }}>OneOn<span className="accent">One</span></span>
        <div style={{ marginTop: 22 }}>
          {status === 'loading' && (
            <p style={{ color: 'var(--color-text-secondary)' }}>{t('auth.telegramLoggingIn')}</p>
          )}
          {status === 'widget' && cfg && (
            <>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: 16 }}>{t('auth.telegram')}</p>
              {/* iframe-виджет (без bot_id): на мобильных браузерах надёжнее
                  всплывающего окна Telegram.Login.auth. */}
              <TelegramLoginButton botUsername={cfg.bot_username} onAuth={handleAuth} onError={(m) => { setStatus('error'); setMessage(m || t('auth.telegramFailed')) }} />
            </>
          )}
          {status === 'toApp' && (
            <>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: 18 }}>{t('auth.yandexReturningToApp')}</p>
              <a href={appLink} className="btn btn-accent" style={{ width: '100%', display: 'inline-block' }}>
                {t('auth.yandexOpenApp')}
              </a>
            </>
          )}
          {status === 'error' && (
            <>
              <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 10 }}>{t('auth.yandexFailedTitle')}</h2>
              <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 22 }}>{message}</p>
              <button onClick={() => { window.location.href = '/' }} className="btn btn-accent" style={{ width: '100%' }}>
                {t('auth.backToLogin')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
