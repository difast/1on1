import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getTeam } from '../api/client'

export default function TeamList({ user }) {
  const { teamId } = useParams()
  const [team, setTeam] = useState(null)

  useEffect(() => {
    getTeam(teamId).then(({ data }) => setTeam(data))
  }, [teamId])

  if (!team) return <div className="text-center py-12">Loading...</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">{team.name}</h1>
          <p className="text-sm text-gray-500">Invite link: /join/{team.invite_code}</p>
        </div>
        <Link
          to={`/tasks/${teamId}`}
          className="bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg hover:bg-indigo-200"
        >
          Team Tasks
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Member</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cadence</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Meeting</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {team.members.map(member => (
              <tr key={member.id} className="border-t hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex items-center space-x-3">
                    <div className="relative">
                      <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                        {member.user_name.charAt(0)}
                      </div>
                      {member.is_registered && (
                        <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{member.user_name}</p>
                      <p className="text-xs text-gray-500">{member.user_email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm capitalize">{member.role}</td>
                <td className="px-6 py-4 text-sm">Every {member.cadence_days} days</td>
                <td className="px-6 py-4 text-sm">
                  {member.last_meeting_date
                    ? new Date(member.last_meeting_date).toLocaleDateString()
                    : 'Never'}
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex px-2 py-1 text-xs rounded-full font-medium ${
                    member.status_color === 'red' ? 'bg-red-100 text-red-800' :
                    member.status_color === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {member.status_color === 'red' ? 'Overdue' :
                     member.status_color === 'yellow' ? 'Due' : 'On track'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <Link
                    to={`/schedule/${teamId}/${member.user_id}`}
                    className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                  >
                    Schedule
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}