import { useState, useEffect } from 'react'
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
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setAuthUser(session.user)
        await loadAppUser(session.user.email)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setAuthUser(session.user)
        await loadAppUser(session.user.email)
      } else {
        setAuthUser(null)
        setAppUser(null)
        localStorage.removeItem('smart_user')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  const handleOnboardingComplete = (user) => {
    setAppUser(user)
    localStorage.setItem('smart_user', JSON.stringify(user))
  }

  const handleUserUpdate = (updatedUser) => {
    setAppUser(updatedUser)
    localStorage.setItem('smart_user', JSON.stringify(updatedUser))
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--color-bg)',
      }}>
        <div className="spinner" />
      </div>
    )
  }

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
