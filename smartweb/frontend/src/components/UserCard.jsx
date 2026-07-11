import { useState, useEffect } from 'react'
import { getUserStats } from '../api/client'

export default function UserCard({ user, onClose }) {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    if (!user?.id) return
    getUserStats(user.id).then(r => setStats(r.data)).catch(() => {})
  }, [user?.id])

  if (!user) return null

  const initial = (user.user_name || user.name || '?').charAt(0).toUpperCase()
  const name = user.user_name || user.name || '—'
  const title = user.user_title || user.title || null
  const role = user.role || null

  const roleBadge = {
    team_lead: { label: 'Тимлид', cls: 'bg-indigo-100 text-indigo-700' },
    member: { label: 'Участник', cls: 'bg-gray-100 text-gray-600' },
  }
  const badge = roleBadge[role] || { label: role, cls: 'bg-gray-100 text-gray-600' }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
        >
          ×
        </button>

        {/* Avatar */}
        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-20 h-20 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-3xl mb-3">
            {initial}
          </div>
          <h2 className="text-xl font-bold text-gray-900">{name}</h2>
          {title && <p className="text-sm text-gray-500 mt-0.5">{title}</p>}
          {role && (
            <span className={`mt-2 text-xs font-medium px-3 py-1 rounded-full ${badge.cls}`}>
              {badge.label}
            </span>
          )}
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
          {[
            { value: stats?.meetings, label: 'Встреч', color: '#4f46e5', bg: '#eef2ff' },
            { value: stats?.teams, label: 'Команд', color: '#0891b2', bg: '#ecfeff' },
            { value: stats?.tasks_done, label: 'Задач', color: '#16a34a', bg: '#f0fdf4' },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '10px 6px', textAlign: 'center' }}>
              <p style={{ fontSize: 20, fontWeight: 800, color: s.color, lineHeight: 1.1 }}>
                {stats ? (s.value ?? 0) : '—'}
              </p>
              <p style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Social links */}
        <div className="space-y-2">
          <div className="flex items-center gap-3 py-2 border-t border-gray-100">
            <span className="text-gray-400 w-5 text-center">TG</span>
            <span className="text-sm font-medium text-gray-500 w-20">Telegram</span>
            {user.telegram ? (
              <a href={`https://t.me/${user.telegram.replace(/^@/, '')}`} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:underline truncate">
                @{user.telegram.replace(/^@/, '')}
              </a>
            ) : (
              <span className="text-sm text-gray-300">не указан</span>
            )}
          </div>
          <div className="flex items-center gap-3 py-2 border-t border-gray-100">
            <span className="text-gray-400 w-5 text-center">in</span>
            <span className="text-sm font-medium text-gray-500 w-20">LinkedIn</span>
            {user.linkedin ? (
              <a href={user.linkedin.startsWith('http') ? user.linkedin : `https://linkedin.com/in/${user.linkedin}`} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:underline truncate">
                {user.linkedin}
              </a>
            ) : (
              <span className="text-sm text-gray-300">не указан</span>
            )}
          </div>
          <div className="flex items-center gap-3 py-2 border-t border-gray-100">
            <span className="text-gray-400 w-5 text-center font-bold">{'<>'}</span>
            <span className="text-sm font-medium text-gray-500 w-20">GitHub</span>
            {user.github ? (
              <a href={`https://github.com/${user.github.replace(/^@/, '')}`} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:underline truncate">
                {user.github}
              </a>
            ) : (
              <span className="text-sm text-gray-300">не указан</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
