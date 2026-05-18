import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getTeams, getTeam } from '../api/client'

export default function Dashboard({ user }) {
  const [teams, setTeams] = useState([])
  const [expandedTeam, setExpandedTeam] = useState(null)
  const [teamMembers, setTeamMembers] = useState({})

  useEffect(() => {
    getTeams().then(({ data }) => setTeams(data))
  }, [])

  const toggleTeam = async (teamId) => {
    if (expandedTeam === teamId) {
      setExpandedTeam(null)
      return
    }
    setExpandedTeam(teamId)
    if (!teamMembers[teamId]) {
      const { data } = await getTeam(teamId)
      setTeamMembers(prev => ({ ...prev, [teamId]: data.members }))
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
          + Create Team
        </button>
      </div>

      {/* Teams */}
      <div className="space-y-4">
        {teams.map(team => (
          <div key={team.id} className="bg-white rounded-xl shadow-sm border">
            <button
              onClick={() => toggleTeam(team.id)}
              className="w-full p-6 text-left flex justify-between items-center"
            >
              <div>
                <h2 className="text-lg font-semibold">{team.name}</h2>
                <p className="text-sm text-gray-500">Invite code: {team.invite_code}</p>
              </div>
              <span className="text-gray-400">{expandedTeam === team.id ? '▲' : '▼'}</span>
            </button>

            {expandedTeam === team.id && teamMembers[team.id] && (
              <div className="px-6 pb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {teamMembers[team.id].map(member => (
                    <MemberCard
                      key={member.id}
                      member={member}
                      teamId={team.id}
                    />
                  ))}
                </div>
                <div className="mt-4">
                  <Link
                    to={`/teams/${team.id}`}
                    className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                  >
                    View full team →
                  </Link>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function MemberCard({ member, teamId }) {
  const statusColors = {
    green: 'bg-green-100 border-green-300',
    yellow: 'bg-yellow-100 border-yellow-300',
    red: 'bg-red-100 border-red-300',
  }

  const statusLabels = {
    green: 'On track',
    yellow: 'Due soon',
    red: 'Overdue',
  }

  return (
    <div className={`p-4 rounded-lg border ${statusColors[member.status_color]}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <div className="relative">
            <div className="w-10 h-10 bg-indigo-500 rounded-full flex items-center justify-center text-white font-bold">
              {member.user_name.charAt(0)}
            </div>
            {member.is_registered && (
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white" />
            )}
          </div>
          <div>
            <p className="font-medium">{member.user_name}</p>
            <p className="text-xs text-gray-500">{member.role}</p>
          </div>
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${
          member.status_color === 'red' ? 'bg-red-200 text-red-800' :
          member.status_color === 'yellow' ? 'bg-yellow-200 text-yellow-800' :
          'bg-green-200 text-green-800'
        }`}>
          {statusLabels[member.status_color]}
        </span>
      </div>

      <div className="text-xs text-gray-600">
        Last meeting: {member.last_meeting_date
          ? new Date(member.last_meeting_date).toLocaleDateString()
          : 'Never'}
      </div>

      <Link
        to={`/schedule/${teamId}/${member.user_id}`}
        className="mt-3 block w-full text-center bg-indigo-600 text-white text-sm py-2 rounded-lg hover:bg-indigo-700"
      >
        Schedule 1-on-1
      </Link>
    </div>
  )
}