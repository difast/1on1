// Вход через Telegram по официальному Telegram Login Widget. Мы НЕ пишем свой
// OAuth — используем telegram-widget.js. Подлинность данных проверяется на
// бэкенде по hash (secret = SHA256(bot_token)).
//
// Компактный формат (по умолчанию на странице входа): круглая фирменная иконка
// Telegram в общем ряду соц-входа. По клику дергаем ОФИЦИАЛЬНУЮ функцию
// Telegram.Login.auth(...) — это штатный способ повесить свою кнопку, а не
// стандартный iframe. Ей нужен числовой bot_id (публичный, отдаётся
// /telegram/config). Результат авторизации — тот же объект, что и у iframe,
// поэтому обработка на бэкенде не меняется и функциональность не страдает.
//
// Fallback: если bot_id недоступен (в окружении веб-бэкенда нет токена), рендерим
// прежний iframe-виджет по публичному bot_username — вход остаётся рабочим.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

let _widgetScriptPromise = null

// Однократно грузим telegram-widget.js и ждём появления window.Telegram.Login.
function loadTelegramWidget() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.Telegram?.Login?.auth) return Promise.resolve()
  if (_widgetScriptPromise) return _widgetScriptPromise
  _widgetScriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://telegram.org/js/telegram-widget.js?22'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => { _widgetScriptPromise = null; reject(new Error('telegram widget failed')) }
    document.head.appendChild(s)
  })
  return _widgetScriptPromise
}

// Официальный логотип Telegram: белый самолётик на фирменном голубом круге
// (круг задаёт фон кнопки, здесь — только сам самолётик).
const TelegramMark = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"
      fill="#FFFFFF"
    />
  </svg>
)

export default function TelegramLoginButton({ botId, botUsername, onAuth, onError, requestAccess = false }) {
  const { t } = useTranslation()
  const iframeRef = useRef(null)
  const onAuthRef = useRef(onAuth)
  const [ready, setReady] = useState(false)
  useEffect(() => { onAuthRef.current = onAuth }, [onAuth])

  const useCompact = !!botId

  // Компактный режим: заранее подгружаем скрипт, чтобы клик открыл окно входа
  // без задержки.
  useEffect(() => {
    if (!useCompact) return
    let alive = true
    loadTelegramWidget().then(() => { if (alive) setReady(true) }).catch(() => {})
    return () => { alive = false }
  }, [useCompact])

  // Fallback-режим: официальный iframe-виджет по bot_username (старое поведение).
  useEffect(() => {
    if (useCompact || !botUsername || !iframeRef.current) return
    const cbName = `onTelegramAuth_${Date.now()}`
    window[cbName] = (user) => { try { onAuthRef.current?.(user) } catch { /* no-op */ } }
    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.async = true
    script.setAttribute('data-telegram-login', botUsername)
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-radius', '10')
    script.setAttribute('data-userpic', 'true')
    script.setAttribute('data-onauth', `${cbName}(user)`)
    if (requestAccess) script.setAttribute('data-request-access', 'write')
    iframeRef.current.innerHTML = ''
    iframeRef.current.appendChild(script)
    return () => {
      try { delete window[cbName] } catch { window[cbName] = undefined }
      if (iframeRef.current) iframeRef.current.innerHTML = ''
    }
  }, [useCompact, botUsername, requestAccess])

  if (!useCompact) {
    return <div ref={iframeRef} style={{ display: 'flex', justifyContent: 'center' }} />
  }

  const handleClick = () => {
    const auth = window.Telegram?.Login?.auth
    if (!auth) { onError?.(t('auth.telegramFailed')); return }
    auth(
      { bot_id: Number(botId), request_access: requestAccess ? 'write' : undefined, lang: 'ru' },
      (data) => {
        // data === false — пользователь закрыл окно/отменил вход: молчим.
        if (data) { try { onAuthRef.current?.(data) } catch { /* no-op */ } }
      },
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!ready}
      aria-label={t('auth.telegram')}
      title={t('auth.telegram')}
      className="social-icon social-icon-telegram"
    >
      <TelegramMark />
    </button>
  )
}
