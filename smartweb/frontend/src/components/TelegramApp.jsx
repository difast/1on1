// Точка входа Telegram Mini App (роут /telegram). Тот же React-кодбейз, не
// отдельная сборка. Авторизация — через initData (Этап 1); интерфейс адаптирован
// под Telegram (тема, вьюпорт, haptic — Этап 2). Внутри рендерятся те же самые
// дашборды, но в контексте surface='telegram', который скрывает запрещённые
// таблицей разделы через условный рендеринг существующих компонентов.
import { useState, useEffect } from 'react'
import { SurfaceContext } from '../lib/surface'
import { initData, initViewport, applyTheme, isTelegram } from '../lib/telegram'
import { telegramMiniAppAuth } from '../api/client'
import { setToken } from '../lib/auth'
import i18n from '../i18n'
import LeadDashboard from './LeadDashboard'
import MemberDashboard from './MemberDashboard'
import Onboarding from './Onboarding'

function Centered({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--color-bg)', textAlign: 'center' }}>
      <div style={{ maxWidth: 320 }}>{children}</div>
    </div>
  )
}

export default function TelegramApp() {
  const [state, setState] = useState('loading')  // loading | no-telegram | error | ready
  const [user, setUser] = useState(null)

  useEffect(() => {
    initViewport()
    applyTheme()
    const w = typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp
    if (w) { try { w.onEvent('themeChanged', applyTheme) } catch {} }

    if (!isTelegram()) { setState('no-telegram'); return }
    (async () => {
      try {
        const { data } = await telegramMiniAppAuth(initData())
        // Сохраняем наш JWT, чтобы api-клиент слал Bearer на все запросы (Этап 8).
        if (data.token) setToken(data.token)
        setUser(data.user)
        if (data.user?.preferred_language) {
          try { i18n.changeLanguage(data.user.preferred_language) } catch {}
        }
        setState('ready')
      } catch {
        setState('error')
      }
    })()
    return () => { if (w) { try { w.offEvent('themeChanged', applyTheme) } catch {} } }
  }, [])

  const onUserUpdate = (u) => setUser(u)

  if (state === 'loading') {
    return <Centered><div className="spinner" style={{ width: 28, height: 28, margin: '0 auto' }} /></Centered>
  }

  if (state === 'no-telegram') {
    return (
      <Centered>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Откройте в Telegram</h2>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
          Эта страница — мини-приложение Telegram. Откройте его через бота @oneononehq_bot.
        </p>
      </Centered>
    )
  }

  if (state === 'error' || !user) {
    return (
      <Centered>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Не удалось войти</h2>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
          Попробуйте переоткрыть приложение из бота.
        </p>
      </Centered>
    )
  }

  // Узкий вьюпорт Mini App: ограничиваем ширину контента.
  const shell = (node) => (
    <SurfaceContext.Provider value="telegram">
      <div className="tg-miniapp" style={{ maxWidth: 480, margin: '0 auto' }}>{node}</div>
    </SurfaceContext.Provider>
  )

  // Новый пользователь без роли — тот же онбординг (existingUser), без создания дубля.
  if (!user.role) {
    return shell(
      <Onboarding email={user.email || ''} existingUser={user} onComplete={setUser} />
    )
  }

  const Dashboard = user.role === 'team_lead' ? LeadDashboard : MemberDashboard
  // onLogout в Mini App неактуален (сессия управляется Telegram) — закрываем приложение.
  const onLogout = () => { try { window.Telegram?.WebApp?.close() } catch {} }
  return shell(<Dashboard user={user} onLogout={onLogout} onUserUpdate={onUserUpdate} />)
}
