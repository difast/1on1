import { useState, useEffect } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { getMeetings } from '../api/client'

export default function Calendar({ teamId, userId }) {
  const [events, setEvents] = useState([])

  useEffect(() => {
    const params = {}
    if (teamId) params.team_id = teamId
    if (userId) params.member_id = userId

    getMeetings(params).then(({ data }) => {
      setEvents(data.map(m => ({
        id: m.id,
        title: `1-on-1`,
        start: m.scheduled_date,
        backgroundColor: m.status === 'confirmed' ? '#4f46e5' : '#f59e0b',
        borderColor: m.status === 'confirmed' ? '#4338ca' : '#d97706',
      })))
    })
  }, [teamId, userId])

  return (
    <div className="bg-white rounded-xl shadow-sm border p-4">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridWeek"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay',
        }}
        events={events}
        height="auto"
        firstDay={1}
      />
    </div>
  )
}