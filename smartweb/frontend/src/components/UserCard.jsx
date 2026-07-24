import { useState, useEffect } from 'react'
import { getUserStats, getUserRecommendations, getUserCard } from '../api/client'

export default function UserCard({ user, teamId, organization: orgProp = null, onClose }) {
  const [stats, setStats] = useState(null)
  const [recs, setRecs] = useState([])  // рекомендации об участнике (39.7), видны команде
  const [card, setCard] = useState(null)  // полные данные карточки (контакты/соцсети/фото/организация)

  // ВАЖНО: в объектах из списка команды `id` — это id членства (TeamMember.id),
  // а настоящий пользователь — в `user_id`. Поэтому сначала берём user_id, иначе
  // откроется чужая карточка (в т.ч. пользователь из старой БД с тем же id членства).
  const uid = user?.user_id || user?.id || null

  useEffect(() => {
    // Сбрасываем данные предыдущего пользователя, чтобы не показать чужие
    // контакты/организацию при переключении карточек.
    setStats(null); setRecs([]); setCard(null)
    if (!uid) return
    let alive = true
    // Полную карточку (контакты, соцсети, фото, организация) берём с бэкенда по id
    // — в списках команды этих полей нет, поэтому раньше они не отображались.
    getUserCard(uid, teamId).then(r => { if (alive) setCard(r.data) }).catch(() => {})
    getUserStats(uid).then(r => { if (alive) setStats(r.data) }).catch(() => {})
    getUserRecommendations(uid).then(r => { if (alive) setRecs(r.data || []) }).catch(() => {})
    return () => { alive = false }
  }, [uid, teamId])

  if (!user) return null

  // Пока карточка грузится, показываем то, что уже передано (имя/должность/фото),
  // затем дополняем/актуализируем данными с бэкенда.
  const name = card?.name || user.user_name || user.name || '—'
  const title = card?.title ?? (user.user_title || user.title || null)
  const role = card?.role || user.role || null
  const avatar = card?.avatar ?? (user.user_avatar_url || user.avatar || null)
  const telegram = card?.telegram ?? user.telegram ?? null
  const linkedin = card?.linkedin ?? user.linkedin ?? null
  const github = card?.github ?? user.github ?? null
  // Организацию показываем мгновенно из пропа (команда её уже знает), затем
  // подтверждаем данными карточки — без «задержки/подскока».
  const organization = card?.organization || orgProp || null
  const initial = (name || '?').charAt(0).toUpperCase()

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

        {/* Avatar (фото профиля, если задано) */}
        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-3xl mb-3 overflow-hidden"
            style={{ background: avatar ? 'transparent' : '#4f46e5' }}>
            {avatar
              ? <img src={avatar} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
              : initial}
          </div>
          <h2 className="text-xl font-bold text-gray-900">{name}</h2>
          {title && <p className="text-sm text-gray-500 mt-0.5">{title}</p>}
          {role && (
            <span className={`mt-2 text-xs font-medium px-3 py-1 rounded-full ${badge.cls}`}>
              {badge.label}
            </span>
          )}
        </div>

        {/* Организация (одна на команду; видна коллегам по команде) */}
        {organization?.name && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 14px', marginBottom: 16 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Организация</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: 0 }}>{organization.name}</p>
            {organization.industry && <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>{organization.industry}</p>}
          </div>
        )}

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

        {/* Контакты и соцсети */}
        <div className="space-y-2">
          <div className="flex items-center gap-3 py-2 border-t border-gray-100">
            <span className="text-gray-400 w-5 text-center">TG</span>
            <span className="text-sm font-medium text-gray-500 w-20">Telegram</span>
            {telegram ? (
              <a href={`https://t.me/${telegram.replace(/^@/, '')}`} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:underline truncate">
                @{telegram.replace(/^@/, '')}
              </a>
            ) : (
              <span className="text-sm text-gray-300">не указан</span>
            )}
          </div>
          <div className="flex items-center gap-3 py-2 border-t border-gray-100">
            <span className="text-gray-400 w-5 text-center">in</span>
            <span className="text-sm font-medium text-gray-500 w-20">LinkedIn</span>
            {linkedin ? (
              <a href={linkedin.startsWith('http') ? linkedin : `https://linkedin.com/in/${linkedin}`} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:underline truncate">
                {linkedin}
              </a>
            ) : (
              <span className="text-sm text-gray-300">не указан</span>
            )}
          </div>
          <div className="flex items-center gap-3 py-2 border-t border-gray-100">
            <span className="text-gray-400 w-5 text-center font-bold">{'<>'}</span>
            <span className="text-sm font-medium text-gray-500 w-20">GitHub</span>
            {github ? (
              <a href={`https://github.com/${github.replace(/^@/, '')}`} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:underline truncate">
                {github}
              </a>
            ) : (
              <span className="text-sm text-gray-300">не указан</span>
            )}
          </div>
        </div>

        {/* Рекомендации об участнике (39.7) — видны всей команде */}
        {recs.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
              Рекомендации как эксперта
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recs.map(r => (
                <div key={r.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', margin: 0 }}>{r.topic || 'Эксперт'}</p>
                  <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>от {r.from_user_name || 'коллеги'}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
