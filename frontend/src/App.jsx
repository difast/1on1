import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './components/Dashboard'
import TeamList from './components/TeamList'
import MeetingScheduler from './components/MeetingScheduler'
import TaskBoard from './components/TaskBoard'

function App() {
  // For MVP, we simulate a logged-in user
  const currentUser = { id: 1, name: 'Demo Lead', role: 'team_lead' }

  return (
    <Layout currentUser={currentUser}>
      <Routes>
        <Route path="/" element={<Dashboard user={currentUser} />} />
        <Route path="/teams/:teamId" element={<TeamList user={currentUser} />} />
        <Route path="/schedule/:teamId/:memberId" element={<MeetingScheduler user={currentUser} />} />
        <Route path="/tasks/:teamId" element={<TaskBoard user={currentUser} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

export default App