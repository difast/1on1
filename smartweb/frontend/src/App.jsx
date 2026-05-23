import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './lib/supabase'
import AuthPage from './components/AuthPage'
import Onboarding from './components/Onboarding'
import LeadDashboard from './components/LeadDashboard'
import MemberDashboard from './components/MemberDashboard'
import { getUserByEmail } from './api/client'

function App() {
  const [authUser, setAuthUser] = useState(null)
  const [appUser, setAppUser] = useState(null)
  const [loading, setLoading] = useState(true)
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
        setAuthUser(null)
        setAppUser(null)
        localStorage.removeItem('smart_user')
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = useCallback(async () => {
    clearTimeout(inactivityTimer.current)
    await supabase.auth.signOut()
  }, [])

  const resetInactivityTimer = useCallback(() => {
    clearTimeout(inactivityTimer.current)
    inactivityTimer.current = setTimeout(() => handleLogout(), INACTIVITY_LIMIT)
  }, [handleLogout, INACTIVITY_LIMIT])

  useEffect(() => {
    if (!authUser) return
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach(e => window.addEventListener(e, resetInactivityTimer, { passive: true }))
    resetInactivityTimer()
    return () => {
      events.forEach(e => window.removeEventListener(e, resetInactivityTimer))
      clearTimeout(inactivityTimer.current)
    }
  }, [authUser, resetInactivityTimer])

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

  if (!authUser) return <AuthPage />

  if (!appUser || !appUser.role) {
    return (
      <Onboarding
        email={authUser.email}
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
