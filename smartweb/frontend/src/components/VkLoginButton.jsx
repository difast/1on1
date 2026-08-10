import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { renderVkOneTap, describeVkError } from '../lib/vkid'
import { completeVkAuth } from '../api/client'

/*
 * Вход через VK ID — рабочая компактная иконка в общем ряду соц-входа.
 *
 * По клику открывается модальное окно с официальным виджетом VK ID SDK
 * (One Tap + QR-авторизация — QR оставлен включённым по умолчанию, как даёт SDK).
 * Виджет отдаёт одноразовый code и device_id; обмен на токен и выдача JWT — на
 * бэкенде (POST /auth/vk/callback), секрет приложения на клиент не попадает.
 * При успехе вызываем onAuth({ token, user, status }) — дальше страница входа
 * сохраняет сессию и уводит в продукт (как Telegram/Yandex ID).
 *
 * Если способ ещё не настроен на бэкенде (enabled=false) — иконка ведёт себя как
 * прежняя заглушка «скоро» (onSoon), а не как рабочая кнопка.
 *
 * Логотип — официальный знак VK (белый на фирменном синем #0077FF).
 */
const VkMark = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M13.16 16.66c-5.48 0-8.86-3.76-9-10.02h2.75c.1 4.6 2.13 6.55 3.74 6.95V6.64h2.59v3.97c1.59-.17 3.26-1.97 3.82-3.97h2.59c-.43 2.47-2.23 4.27-3.52 5.02 1.29.6 3.34 2.17 4.12 5h-2.85c-.61-1.9-2.13-3.36-4.15-3.56v3.56h-.31z"
      fill="#FFFFFF"
    />
  </svg>
)

const SoonBadge = () => (
  <span className="social-soon-badge" aria-hidden="true">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="var(--color-text-muted)" strokeWidth="2" />
      <path d="M12 7.5V12l3 2" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
)

export default function VkLoginButton({ enabled = false, config = null, onAuth, onError, onSoon }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  // Ошибка держится ВНУТРИ модалки (не закрываем окно молча): показываем
  // реальный текст ошибки VK ID SDK/бэкенда, чтобы причина была видна на экране,
  // а не только в консоли.
  const [modalError, setModalError] = useState('')
  const containerRef = useRef(null)
  const cleanupRef = useRef(null)
  const doneRef = useRef(false)
  const [attempt, setAttempt] = useState(0)  // «Повторить» пересоздаёт виджет

  // Рендер виджета при открытии модалки.
  useEffect(() => {
    if (!open || !config || !containerRef.current) return
    doneRef.current = false
    let alive = true
    renderVkOneTap(
      containerRef.current,
      { appId: config.app_id, redirectUrl: config.redirect_url, scope: config.scope, idDomain: config.id_domain },
      async ({ code, device_id, code_verifier, state }) => {
        if (doneRef.current) return
        doneRef.current = true
        setBusy(true)
        try {
          const { data } = await completeVkAuth({ code, device_id, code_verifier, state })
          onAuth?.(data)
        } catch (err) {
          try { console.error('[VK ID] backend callback error', err?.response?.status, err?.response?.data) } catch { /* no-op */ }
          const detail = err?.response?.data?.detail
          setModalError(`${t('auth.vkBackendError')}: ${detail?.message || (typeof detail === 'string' ? detail : (err?.message || 'error'))}`)
        } finally { if (alive) setBusy(false) }
      },
      (e) => {
        // Ошибка самого виджета VK ID (до обращения к нашему бэкенду): показываем
        // текст от VK — обычно это проблема настройки приложения VK ID
        // (redirect URI/домен/публикация), а не нашего кода.
        try { console.error('[VK ID] widget error', e) } catch { /* no-op */ }
        if (alive) setModalError(`${t('auth.vkWidgetError')}: ${describeVkError(e) || 'unknown'}`)
      },
    ).then((cleanup) => { cleanupRef.current = cleanup })
      .catch((e) => {
        // Не удалось загрузить/инициализировать SDK (например, скрипт VK ID не
        // подгрузился).
        try { console.error('[VK ID] sdk load/init error', e) } catch { /* no-op */ }
        if (alive) setModalError(t('auth.vkSdkLoadError'))
      })
    return () => {
      alive = false
      try { cleanupRef.current?.() } catch { /* no-op */ }
      cleanupRef.current = null
    }
  }, [open, config, attempt])

  const handleClick = () => {
    if (!enabled) { onSoon?.(t('auth.vkSoon')); return }
    onError?.('')
    setModalError('')
    setOpen(true)
  }

  const retry = () => { setModalError(''); doneRef.current = false; setAttempt(a => a + 1) }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label={enabled ? t('auth.vk') : `${t('auth.vk')} — ${t('auth.soon')}`}
        title={enabled ? t('auth.vk') : `${t('auth.vk')} — ${t('auth.soon')}`}
        aria-disabled={enabled ? undefined : 'true'}
        className={`social-icon social-icon-vk${enabled ? '' : ' social-icon-soon'}`}
      >
        <VkMark />
        {!enabled && <SoonBadge />}
      </button>

      {open && (
        <div
          className="vk-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t('auth.vk')}
          onClick={(e) => { if (e.target === e.currentTarget && !busy) setOpen(false) }}
        >
          <div className="vk-modal card">
            <div className="vk-modal-head">
              <span style={{ fontWeight: 600, fontSize: 15 }}>{t('auth.vk')}</span>
              <button
                type="button" className="vk-modal-close" aria-label={t('common.close')}
                onClick={() => { if (!busy) setOpen(false) }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
              </button>
            </div>
            {/* Контейнер, в который VK ID SDK монтирует One Tap + QR. */}
            <div ref={containerRef} className="vk-widget-slot" style={modalError ? { display: 'none' } : undefined} />
            {modalError && (
              <div className="vk-modal-error">
                <p style={{ fontSize: 13, color: 'var(--color-danger)', wordBreak: 'break-word', marginBottom: 12 }}>
                  {modalError}
                </p>
                <button type="button" className="btn btn-accent" style={{ width: '100%' }} onClick={retry}>
                  {t('common.retry') || 'ОК'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
