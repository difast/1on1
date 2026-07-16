import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './lib/supabase'
import AuthPage from './components/AuthPage'
import Onboarding from './components/Onboarding'
import LeadDashboard from './components/LeadDashboard'
import MemberDashboard from './components/MemberDashboard'
import AdminDashboard from './components/AdminDashboard'
import { getUserByEmail, getUser, detectRegion } from './api/client'
import i18n from './i18n'

const TG_SESSION_KEY = 'tg_session'

function App() {
  const [authUser, setAuthUser] = useState(null)
  const [appUser, setAppUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  // Вход через Telegram живёт параллельно с Supabase-сессией (email/пароль) и
  // ведёт в тот же users-аккаунт по telegram_id. Здесь — признак такой сессии.
  const [tgAuthed, setTgAuthed] = useState(false)
  const inactivityTimer = useRef(null)

  // Apply dark theme on first render (before user loads); Layout will
  // override with the user's personal preference once they are known.
  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])
  const INACTIVITY_LIMIT = 5 * 60 * 60 * 1000 // 5 hours

  const loadAppUser = async (email) => {
    try {
      const { data } = await getUserByEmail(email)
      setAppUser(data)
      localStorage.setItem('smart_user', JSON.stringify(data))
      return data
    } catch {
      setAppUser(null)
      return null
    }
  }

  // Восстановить Telegram-сессию из localStorage (когда нет Supabase-сессии).
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
    setAppUser(user); setTgAuthed(true); setAuthUser(null)
    localStorage.setItem(TG_SESSION_KEY, JSON.stringify({ id: user.id }))
    localStorage.setItem('smart_user', JSON.stringify(user))
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        if (event === 'INITIAL_SESSION') {
          // Restored session from storage — check if user still exists in backend.
          // If the DB was reset (404), sign out so the auth form is shown instead
          // of the onboarding screen.
          try {
            const { data } = await getUserByEmail(session.user.email)
            setAppUser(data)
            localStorage.setItem('smart_user', JSON.stringify(data))
          } catch (err) {
            setAppUser(null)
            if (err?.response?.status === 404) {
              await supabase.auth.signOut()
              return
            }
            // Other errors (network issues etc) — keep session, appUser stays null
          }
          setAuthUser(session.user)
        } else {
          // Fresh login / email confirmation / token refresh
          await loadAppUser(session.user.email)
          setAuthUser(session.user)
        }
      } else {
        // Нет Supabase-сессии — возможно, активна Telegram-сессия.
        const restored = await restoreTelegramSession()
        if (!restored) {
          setAuthUser(null)
          setAppUser(null)
          setTgAuthed(false)
          localStorage.removeItem('smart_user')
        }
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = useCallback(async () => {
    clearTimeout(inactivityTimer.current)
    localStorage.removeItem(TG_SESSION_KEY)
    localStorage.removeItem('smart_user')
    setTgAuthed(false)
    setAppUser(null)
    await supabase.auth.signOut()  // no-op при Telegram-только сессии
  }, [])

  const resetInactivityTimer = useCallback(() => {
    clearTimeout(inactivityTimer.current)
    inactivityTimer.current = setTimeout(() => handleLogout(), INACTIVITY_LIMIT)
  }, [handleLogout, INACTIVITY_LIMIT])

  useEffect(() => {
    if (!authUser && !tgAuthed) return
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach(e => window.addEventListener(e, resetInactivityTimer, { passive: true }))
    resetInactivityTimer()
    return () => {
      events.forEach(e => window.removeEventListener(e, resetInactivityTimer))
      clearTimeout(inactivityTimer.current)
    }
  }, [authUser, resetInactivityTimer])

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

  if (loading) return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--color-bg)',
    }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )

  if (isAdmin) return <AdminDashboard onLogout={() => setIsAdmin(false)} />

  if (!authUser && !tgAuthed) {
    return <AuthPage onAdminLogin={() => setIsAdmin(true)} onTelegramAuth={handleTelegramAuth} />
  }

  if (!appUser || !appUser.role) {
    // Telegram-пользователь уже создан на бэкенде (с пустой ролью) — онбординг
    // только выбирает роль/профиль поверх существующего аккаунта (existingUser).
    return (
      <Onboarding
        email={appUser?.email || authUser?.email || ''}
        existingUser={tgAuthed ? appUser : null}
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
