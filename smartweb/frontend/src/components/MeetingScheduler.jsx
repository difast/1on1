import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getAvailableSlots, createMeeting, getUser } from '../api/client'

export default function MeetingScheduler({ user }) {
  const { teamId, memberId } = useParams()
  const [slots, setSlots] = useState([])
  const [member, setMember] = useState(null)
  const [loading, setLoading] = useState(true)
  const [scheduling, setScheduling] = useState(false)
  const [agenda, setAgenda] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    Promise.all([
      getAvailableSlots({
        team_lead_id: user.id,
        member_id: parseInt(memberId),
        days_ahead: 7,
      }),
      getUser(memberId),
    ]).then(([slotsRes, memberRes]) => {
      setSlots(slotsRes.data.proposed_slots)
      setMember(memberRes.data)
      setLoading(false)
    })
  }, [teamId, memberId])

  const handleSchedule = async (slot) => {
    setScheduling(true)
    try {
      await createMeeting({
        team_id: parseInt(teamId),
        team_lead_id: user.id,
        member_id: parseInt(memberId),
        scheduled_date: slot.start,
        agenda: agenda || undefined,
      })
      setSuccess(true)
    } catch (err) {
      console.error('Failed to schedule:', err)
    }
    setScheduling(false)
  }

  if (loading) return <div className="text-center py-12">Finding best slots...</div>
  if (success) return (
    <div className="text-center py-12">
      <div className="mb-4 flex justify-center">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="22" stroke="#16a34a" strokeWidth="2.5"/>
          <path d="M14 24l7 7 13-14" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-green-600 mb-2">Meeting Scheduled!</h2>
      <p className="text-gray-600">Your 1-on-1 with {member?.name} has been booked.</p>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">
        Schedule 1-on-1 with {member?.name}
      </h1>
      <p className="text-gray-500 mb-6">{member?.title}</p>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Agenda (optional)
        </label>
        <textarea
          value={agenda}
          onChange={(e) => setAgenda(e.target.value)}
          className="w-full border rounded-lg p-3 text-sm"
          rows={3}
          placeholder="Topics to discuss..."
        />
      </div>

      <h2 className="text-lg font-semibold mb-4">Available slots</h2>
      <div className="space-y-3">
        {slots.map((slot, i) => (
          <div
            key={i}
            className="bg-white border rounded-lg p-4 flex justify-between items-center hover:border-indigo-300"
          >
            <div>
              <p className="font-medium">
                {new Date(slot.start).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
              <p className="text-sm text-gray-500">
                {new Date(slot.start).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {' - '}
                {new Date(slot.end).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <button
              onClick={() => handleSchedule(slot)}
              disabled={scheduling}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {scheduling ? 'Booking...' : 'Book'}
            </button>
          </div>
        ))}
        {slots.length === 0 && (
          <p className="text-gray-500 text-center py-8">
            No available slots found. Try expanding the search range.
          </p>
        )}
      </div>
    </div>
  )
}