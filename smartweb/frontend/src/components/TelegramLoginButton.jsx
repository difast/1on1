// Официальный Telegram Login Widget (Этап 3). Мы НЕ пишем свой OAuth — просто
// подключаем скрипт telegram-widget.js, который рендерит кнопку «Log in with
// Telegram». Результат авторизации Telegram отдаёт в глобальный колбэк, который
// мы прокидываем в onAuth. Подлинность данных проверяется на бэкенде по hash.
import { useEffect, useRef } from 'react'

let _cbSeq = 0

export default function TelegramLoginButton({ botUsername, onAuth, requestAccess = false }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!botUsername || !ref.current) return
    // Уникальное имя глобального колбэка — виджет вызывает window[callback](user).
    const cbName = `onTelegramAuth_${++_cbSeq}`
    window[cbName] = (user) => { try { onAuth?.(user) } catch (e) { /* no-op */ } }

    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.async = true
    script.setAttribute('data-telegram-login', botUsername)
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-radius', '10')
    script.setAttribute('data-userpic', 'true')
    script.setAttribute('data-onauth', `${cbName}(user)`)
    if (requestAccess) script.setAttribute('data-request-access', 'write')

    ref.current.innerHTML = ''
    ref.current.appendChild(script)

    return () => {
      try { delete window[cbName] } catch { window[cbName] = undefined }
      if (ref.current) ref.current.innerHTML = ''
    }
  }, [botUsername, onAuth, requestAccess])

  return <div ref={ref} style={{ display: 'flex', justifyContent: 'center' }} />
}
