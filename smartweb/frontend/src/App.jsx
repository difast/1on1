import { useState, useEffect, useRef, useCallback } from 'react'
import { getToken, clearToken } from './lib/auth'
import AuthPage from './components/AuthPage'
import Onboarding from './components/Onboarding'
import LeadDashboard from './components/LeadDashboard'
import MemberDashboard from './components/MemberDashboard'
import AdminDashboard from './components/AdminDashboard'
import TelegramApp from './components/TelegramApp'
import ConfirmEmailPage from './components/ConfirmEmailPage'
import ResetPasswordPage from './components/ResetPasswordPage'
import { authMe, getUser, detectRegion } from './api/client'
import i18n from './i18n'

const TG_SESSION_KEY = 'tg_session'

function App() {
  // Отдельные маршруты, не требующие сессии. Проверяем ДО любых хуков.
  const path = typeof window !== 'undefined' ? window.location.pathname : ''
  const isTelegramRoute = path.startsWith('/telegram')
  const isConfirmRoute = path.startsWith('/confirm-email')
  const isResetRoute = path.startsWith('/reset-password')

  const [appUser, setAppUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  // Вход через Telegram живёт параллельно с email/пароль-сессией и ведёт в тот
  // же users-аккаунт по telegram_id. Здесь — признак такой сессии.
  const [tgAuthed, setTgAuthed] = useState(false)
  const inactivityTimer = useRef(null)

  // Apply dark theme on first render (before user loads); Layout will
  // override with the user's personal preference once they are known.
  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])
  const INACTIVITY_LIMIT = 5 * 60 * 60 * 1000 // 5 hours

  // Восстановить Telegram-сессию из localStorage (когда нет JWT-сессии).
  const restoreTelegramSession = async () => {
    const raw = localStorage.getItem(TG_SESSION_KEY)
    if (!raw) return false
    try {
      const { id } = JSON.parse(raw)
      const { data } = await getUser(id)
      setAppUser(data); setTgAuthed(true)
      localStorage.setItem('smart_user', JSON.stringify(data))
      return true
    } catch {
      localStorage.removeItem(TG_SESSION_KEY)
      return false
    }
  }

  // Успешный вход через Telegram (виджет): { status, user }. Ставим ту же
  // сессию, что и для email-входа, и запоминаем её как Telegram-сессию.
  const handleTelegramAuth = async ({ user }) => {
    if (!user) return
    setAppUser(user); setTgAuthed(true)
    localStorage.setItem(TG_SESSION_KEY, JSON.stringify({ id: user.id }))
    localStorage.setItem('smart_user', JSON.stringify(user))
  }

  // Успешный вход/регистрация по email (свой JWT уже сохранён в AuthPage).
  const handleAuthSuccess = (user) => {
    if (!user) return
    setTgAuthed(false)
    setAppUser(user)
    localStorage.setItem('smart_user', JSON.stringify(user))
  }

  // Восстановление сессии при загрузке: сначала свой JWT (/auth/me), при его
  // отсутствии/невалидности — Telegram-сессия.
  useEffect(() => {
    if (isTelegramRoute || isConfirmRoute || isResetRoute) { setLoading(false); return }
    ;(async () => {
      if (getToken()) {
        try {
          const { data } = await authMe()
          setAppUser(data)
          localStorage.setItem('smart_user', JSON.stringify(data))
          setLoading(false)
          return
        } catch {
          clearToken()  // токен просрочен/битый
        }
      }
      await restoreTelegramSession()
      setLoading(false)
    })()
  }, [])

  const handleLogout = useCallback(async () => {
    clearTimeout(inactivityTimer.current)
    clearToken()
    localStorage.removeItem(TG_SESSION_KEY)
    localStorage.removeItem('smart_user')
    setTgAuthed(false)
    setAppUser(null)
  }, [])

  const resetInactivityTimer = useCallback(() => {
    clearTimeout(inactivityTimer.current)
    inactivityTimer.current = setTimeout(() => handleLogout(), INACTIVITY_LIMIT)
  }, [handleLogout, INACTIVITY_LIMIT])

  useEffect(() => {
    if (!appUser && !tgAuthed) return
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach(e => window.addEventListener(e, resetInactivityTimer, { passive: true }))
    resetInactivityTimer()
    return () => {
      events.forEach(e => window.removeEventListener(e, resetInactivityTimer))
      clearTimeout(inactivityTimer.current)
    }
  }, [appUser, tgAuthed, resetInactivityTimer])

  // Когда пользователь известен: (1) применяем сохранённый язык (если выбирал
  // раньше) — иначе остаётся язык браузера; (2) один раз определяем регион по IP
  // и сохраняем как предполагаемый (Этап 5) — на UI это ничего не меняет.
  useEffect(() => {
    if (!appUser?.id) return
    if (appUser.preferred_language &&
        appUser.preferred_language !== (i18n.resolvedLanguage || i18n.language)) {
      i18n.changeLanguage(appUser.preferred_language)
    }
    detectRegion(appUser.id).catch(() => {})
  }, [appUser?.id])

  const handleOnboardingComplete = (user) => {
    setAppUser(user)
    localStorage.setItem('smart_user', JSON.stringify(user))
  }

  const handleUserUpdate = (updatedUser) => {
    setAppUser(updatedUser)
    localStorage.setItem('smart_user', JSON.stringify(updatedUser))
  }

  // Mini App и отдельные страницы писем — не ждём сессию.
  if (isTelegramRoute) return <TelegramApp />
  if (isConfirmRoute) return <ConfirmEmailPage />
  if (isResetRoute) return <ResetPasswordPage />

  if (loading) return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--color-bg)',
    }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )

  if (isAdmin) return <AdminDashboard onLogout={() => setIsAdmin(false)} />

  if (!appUser && !tgAuthed) {
    return (
      <AuthPage
        onAdminLogin={() => setIsAdmin(true)}
        onTelegramAuth={handleTelegramAuth}
        onAuthSuccess={handleAuthSuccess}
      />
    )
  }

  if (!appUser || !appUser.role) {
    // Пользователь уже создан на бэкенде (email-регистрация или Telegram) с
    // пустой ролью — онбординг выбирает роль/профиль поверх существующего
    // аккаунта (existingUser -> updateUser, без дубля).
    return (
      <Onboarding
        email={appUser?.email || ''}
        existingUser={appUser && !appUser.role ? appUser : null}
        onComplete={handleOnboardingComplete}
      />
    )
  }

  if (appUser.role === 'team_lead') {
    return <LeadDashboard user={appUser} onLogout={handleLogout} onUserUpdate={handleUserUpdate} />
  }

  return <MemberDashboard user={appUser} onLogout={handleLogout} onUserUpdate={handleUserUpdate} />
}

export default App
