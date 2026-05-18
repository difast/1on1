import { useState, useEffect } from 'react'
import Onboarding from './components/Onboarding'
import LeadDashboard from './components/LeadDashboard'
import MemberDashboard from './components/MemberDashboard'

function App() {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('smart_user')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })

  const initialInviteCode = new URLSearchParams(window.location.search).get('join') || ''

  const handleComplete = (newUser) => {
    localStorage.setItem('smart_user', JSON.stringify(newUser))
    setUser(newUser)
  }

  const handleLogout = () => {
    localStorage.removeItem('smart_user')
    setUser(null)
  }

  const handleUserUpdate = (updatedUser) => {
    setUser(updatedUser)
  }

  if (!user) {
    return <Onboarding initialInviteCode={initialInviteCode} onComplete={handleComplete} />
  }

  if (user.role === 'team_lead') {
    return <LeadDashboard user={user} onLogout={handleLogout} onUserUpdate={handleUserUpdate} />
  }

  return <MemberDashboard user={user} onLogout={handleLogout} onUserUpdate={handleUserUpdate} />
}

export default App
