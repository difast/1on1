import { useState, useEffect } from 'react'
import { getUnreadCount, getNotifications, markAllRead, updateUser } from '../api/client'
import NotificationBell from './NotificationBell'

export default function Layout({ children, currentUser, onLogout, onUserUpdate }) {
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifications, setNotifications] = useState([])

  // Profile sidebar edit state
  const [editing, setEditing] = useState(false)
  const [profileForm, setProfileForm] = useState({
    title: currentUser?.title || '',
    telegram: currentUser?.telegram || '',
    linkedin: currentUser?.linkedin || '',
    github: currentUser?.github || '',
  })
  const [savingProfile, setSavingProfile] = useState(false)

  useEffect(() => {
    if (currentUser?.id) {
      getUnreadCount(currentUser.id).then(r => setUnreadCount(r.data.unread_count)).catch(() => {})
    }
  }, [currentUser])

  // Sync form when currentUser changes
  useEffect(() => {
    setProfileForm({
      title: currentUser?.title || '',
      telegram: currentUser?.telegram || '',
      linkedin: currentUser?.linkedin || '',
      github: currentUser?.github || '',
    })
  }, [currentUser])

  const toggleNotifications = async () => {
    if (!showNotifications) {
      const { data } = await getNotifications(currentUser.id)
      setNotifications(data)
    }
    setShowNotifications(!showNotifications)
  }

  const handleMarkAllRead = async () => {
    await markAllRead(currentUser.id)
    setUnreadCount(0)
    setNotifications(notifications.map(n => ({ ...n, read: true })))
  }

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    if (!currentUser?.id) return
    setSavingProfile(true)
    try {
      const payload = {
        title: profileForm.title.trim() || null,
        telegram: profileForm.telegram.trim() || null,
        linkedin: profileForm.linkedin.trim() || null,
        github: profileForm.github.trim() || null,
      }
      const { data: updatedUser } = await updateUser(currentUser.id, payload)
      // Merge updated fields into localStorage
      try {
        const stored = localStorage.getItem('smart_user')
        const u = stored ? JSON.parse(stored) : {}
        const merged = { ...u, ...payload }
        localStorage.setItem('smart_user', JSON.stringify(merged))
        if (onUserUpdate) onUserUpdate(merged)
      } catch {}
      setEditing(false)
    } catch {
      // silent
    } finally {
      setSavingProfile(false)
    }
  }

  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !currentUser?.id) return
    setUploadingAvatar(true)
    try {
      const reader = new FileReader()
      reader.onload = async (ev) => {
        const base64 = ev.target.result
        await updateUser(currentUser.id, { avatar: base64 })
        const stored = localStorage.getItem('smart_user')
        const u = stored ? JSON.parse(stored) : {}
        const merged = { ...u, avatar: base64 }
        localStorage.setItem('smart_user', JSON.stringify(merged))
        if (onUserUpdate) onUserUpdate(merged)
        setUploadingAvatar(false)
      }
      reader.readAsDataURL(file)
    } catch { setUploadingAvatar(false) }
  }

  const user = currentUser
  const initial = (user?.name || '?').charAt(0).toUpperCase()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav — full width */}
      <nav className="bg-white shadow-sm border-b border-gray-200 fixed top-0 left-0 right-0 z-40">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <span className="text-xl font-bold text-indigo-600">Smart 1-on-1</span>
            </div>
            <div className="flex items-center space-x-3">
              <NotificationBell
                count={unreadCount}
                onClick={toggleNotifications}
              />
              <div className="text-sm text-gray-600 font-medium">
                {user?.name}
              </div>
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="text-sm text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-300 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Выйти
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Notification dropdown */}
      {showNotifications && (
        <div className="fixed right-4 top-16 w-96 bg-white shadow-xl rounded-lg border z-50">
          <div className="p-4 border-b flex justify-between items-center">
            <h3 className="font-semibold">Уведомления</h3>
            <button
              onClick={handleMarkAllRead}
              className="text-sm text-indigo-600 hover:text-indigo-800"
            >
              Прочитать все
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-4 text-gray-500 text-center">Нет уведомлений</p>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`p-4 border-b hover:bg-gray-50 ${!n.read ? 'bg-indigo-50' : ''}`}
                >
                  <p className="font-medium text-sm">{n.title}</p>
                  <p className="text-xs text-gray-500 mt-1">{n.body}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Body: sidebar + content */}
      <div className="flex pt-16 min-h-screen">
        {/* Left sidebar */}
        <aside className="w-64 fixed left-0 top-16 bottom-0 bg-white border-r border-gray-200 flex flex-col overflow-y-auto z-30">
          <div className="p-5 flex flex-col items-center text-center border-b border-gray-100">
            {/* Avatar with upload */}
            <label className="relative cursor-pointer group mb-3">
              <div className="w-16 h-16 rounded-full overflow-hidden bg-indigo-600 flex items-center justify-center text-white font-bold text-2xl">
                {user?.avatar
                  ? <img src={user.avatar} alt="avatar" className="w-full h-full object-cover" />
                  : initial}
              </div>
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <span className="text-white text-xs">{uploadingAvatar ? '...' : '📷'}</span>
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </label>
            <p className="font-bold text-gray-900 text-sm leading-tight">{user?.name || '—'}</p>
            {user?.title && (
              <p className="text-xs text-gray-500 mt-0.5">{user.title}</p>
            )}
            {!user?.title && !editing && (
              <p className="text-xs text-gray-300 mt-0.5 italic">должность не указана</p>
            )}
          </div>

          {/* Social links */}
          {!editing && (
            <div className="px-5 py-4 space-y-2 border-b border-gray-100 flex-1">
              <SocialLink
                icon="✈"
                label="Telegram"
                value={user?.telegram}
                href={user?.telegram ? `https://t.me/${user.telegram.replace(/^@/, '')}` : null}
                display={user?.telegram ? `@${user.telegram.replace(/^@/, '')}` : null}
                placeholder="не указан"
              />
              <SocialLink
                icon="in"
                label="LinkedIn"
                value={user?.linkedin}
                href={user?.linkedin
                  ? (user.linkedin.startsWith('http') ? user.linkedin : `https://linkedin.com/in/${user.linkedin}`)
                  : null}
                display={user?.linkedin}
                placeholder="не указан"
              />
              <SocialLink
                icon="<>"
                label="GitHub"
                value={user?.github}
                href={user?.github ? `https://github.com/${user.github.replace(/^@/, '')}` : null}
                display={user?.github}
                placeholder="не указан"
              />
            </div>
          )}

          {/* Edit form */}
          {editing && (
            <form onSubmit={handleSaveProfile} className="px-5 py-4 space-y-3 border-b border-gray-100 flex-1">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Должность</label>
                <input
                  type="text"
                  value={profileForm.title}
                  onChange={e => setProfileForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="Senior Engineer"
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Telegram</label>
                <input
                  type="text"
                  value={profileForm.telegram}
                  onChange={e => setProfileForm(p => ({ ...p, telegram: e.target.value }))}
                  placeholder="@username"
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">LinkedIn</label>
                <input
                  type="text"
                  value={profileForm.linkedin}
                  onChange={e => setProfileForm(p => ({ ...p, linkedin: e.target.value }))}
                  placeholder="username или URL"
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">GitHub</label>
                <input
                  type="text"
                  value={profileForm.github}
                  onChange={e => setProfileForm(p => ({ ...p, github: e.target.value }))}
                  placeholder="username"
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="flex-1 text-xs border border-gray-200 text-gray-600 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="flex-1 text-xs bg-indigo-600 text-white py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                >
                  {savingProfile ? '...' : 'Сохранить'}
                </button>
              </div>
            </form>
          )}

          {/* Edit button */}
          {!editing && (
            <div className="px-5 py-4">
              <button
                onClick={() => setEditing(true)}
                className="w-full text-sm border border-gray-200 text-gray-600 py-2 rounded-xl hover:bg-gray-50 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
              >
                Редактировать
              </button>
            </div>
          )}
        </aside>

        {/* Main content */}
        <main className="ml-64 flex-1 px-6 py-8">
          {children}
        </main>
      </div>
    </div>
  )
}

function SocialLink({ icon, label, value, href, display, placeholder }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-gray-400 text-xs w-5 flex-shrink-0 mt-0.5 text-center font-mono">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        {value && href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-indigo-600 hover:underline break-all"
          >
            {display || value}
          </a>
        ) : (
          <p className="text-xs text-gray-300 italic">{placeholder}</p>
        )}
      </div>
    </div>
  )
}
