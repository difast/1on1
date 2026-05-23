import { useState, useEffect, useRef } from 'react'
import { getUnreadCount, getNotifications, markAllRead, updateUser } from '../api/client'
import NotificationBell from './NotificationBell'

export default function Layout({ children, currentUser, onLogout, onUserUpdate }) {
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [scrolled, setScrolled] = useState(false)

  // Profile sidebar edit state
  const [editing, setEditing] = useState(false)
  const [profileForm, setProfileForm] = useState({
    title: currentUser?.title || '',
    telegram: currentUser?.telegram || '',
    linkedin: currentUser?.linkedin || '',
    github: currentUser?.github || '',
  })
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  useEffect(() => {
    if (currentUser?.id) {
      getUnreadCount(currentUser.id).then(r => setUnreadCount(r.data.unread_count)).catch(() => {})
    }
  }, [currentUser])

  useEffect(() => {
    setProfileForm({
      title: currentUser?.title || '',
      telegram: currentUser?.telegram || '',
      linkedin: currentUser?.linkedin || '',
      github: currentUser?.github || '',
    })
  }, [currentUser])

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 0)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

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
      await updateUser(currentUser.id, payload)
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

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0]
    if (!file || !currentUser?.id) return
    setUploadingAvatar(true)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = async () => {
        const MAX = 256
        const ratio = Math.min(MAX / img.width, MAX / img.height, 1)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * ratio)
        canvas.height = Math.round(img.height * ratio)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        const base64 = canvas.toDataURL('image/jpeg', 0.85)
        try {
          await updateUser(currentUser.id, { avatar: base64 })
          const stored = localStorage.getItem('smart_user')
          const u = stored ? JSON.parse(stored) : {}
          const merged = { ...u, avatar: base64 }
          localStorage.setItem('smart_user', JSON.stringify(merged))
          if (onUserUpdate) onUserUpdate(merged)
        } catch {
          // silent
        } finally {
          setUploadingAvatar(false)
        }
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  }

  const user = currentUser
  const initial = (user?.name || '?').charAt(0).toUpperCase()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      {/* Header — exactly as per .header CSS spec */}
      <header className={`header${scrolled ? ' scrolled' : ''}`}>
        <span className="logo">OneOn<span className="accent">One</span></span>

        <nav className="nav">
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <NotificationBell count={unreadCount} onClick={toggleNotifications} />
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            {user?.name}
          </span>
          {onLogout && (
            <button onClick={onLogout} className="btn btn-ghost btn-sm">
              Выйти
            </button>
          )}
        </div>
      </header>

      {/* Notification dropdown */}
      {showNotifications && (
        <div style={{
          position: 'fixed', right: 16, top: 68, width: 360,
          background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-lg)',
          zIndex: 150, overflow: 'hidden', animation: 'popIn 0.2s var(--ease-spring)',
        }}>
          <div style={{
            padding: '14px 18px', borderBottom: '1px solid var(--color-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-text-primary)' }}>
              Уведомления
            </span>
            <button
              onClick={handleMarkAllRead}
              style={{ fontSize: 13, color: 'var(--color-accent)', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Прочитать все
            </button>
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <p style={{ padding: '20px 18px', color: 'var(--color-text-muted)', fontSize: 14, textAlign: 'center' }}>
                Нет уведомлений
              </p>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  style={{
                    padding: '12px 18px', borderBottom: '1px solid var(--color-border)',
                    background: !n.read ? 'var(--blue-50)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  <p style={{ fontWeight: 500, fontSize: 14, color: 'var(--color-text-primary)' }}>{n.title}</p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>{n.body}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Body: sidebar + main */}
      <div style={{ display: 'flex' }}>
        {/* Sidebar */}
        <aside style={{
          width: 240,
          position: 'fixed',
          top: 58,
          bottom: 0,
          left: 0,
          overflowY: 'auto',
          background: 'var(--color-surface)',
          borderRight: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 90,
        }}>
          {/* Profile */}
          <div style={{
            padding: '24px 20px 18px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
            borderBottom: '1px solid var(--color-border)',
          }}>
            <label style={{ position: 'relative', cursor: 'pointer', marginBottom: 12 }} className="group">
              <div className={`avatar avatar-xl avatar-circle ${user?.avatar ? '' : 'avatar-accent'}`}
                style={{ width: 64, height: 64, borderRadius: '50%' }}>
                {user?.avatar
                  ? <img src={user.avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                  : initial}
              </div>
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                background: 'rgba(0,0,0,0.4)', opacity: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'opacity 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.opacity = 1}
                onMouseLeave={e => e.currentTarget.style.opacity = 0}
              >
                <span style={{ color: '#fff', fontSize: 16 }}>{uploadingAvatar ? '⏳' : '📷'}</span>
              </div>
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
            </label>

            <p style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-text-primary)', lineHeight: 1.3 }}>
              {user?.name || '—'}
            </p>
            {user?.title
              ? <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>{user.title}</p>
              : <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3, fontStyle: 'italic' }}>должность не указана</p>
            }
          </div>

          {/* Social links */}
          {!editing && (
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
              <SocialLink icon="✈" label="Telegram" value={user?.telegram}
                href={user?.telegram ? `https://t.me/${user.telegram.replace(/^@/, '')}` : null}
                display={user?.telegram ? `@${user.telegram.replace(/^@/, '')}` : null}
                placeholder="не указан" />
              <SocialLink icon="in" label="LinkedIn" value={user?.linkedin}
                href={user?.linkedin ? (user.linkedin.startsWith('http') ? user.linkedin : `https://linkedin.com/in/${user.linkedin}`) : null}
                display={user?.linkedin} placeholder="не указан" />
              <SocialLink icon="⌥" label="GitHub" value={user?.github}
                href={user?.github ? `https://github.com/${user.github.replace(/^@/, '')}` : null}
                display={user?.github} placeholder="не указан" />
            </div>
          )}

          {/* Edit form */}
          {editing && (
            <form onSubmit={handleSaveProfile} style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
              {[
                { key: 'title', label: 'Должность', placeholder: 'Senior Engineer' },
                { key: 'telegram', label: 'Telegram', placeholder: '@username' },
                { key: 'linkedin', label: 'LinkedIn', placeholder: 'username или URL' },
                { key: 'github', label: 'GitHub', placeholder: 'username' },
              ].map(f => (
                <div key={f.key} className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">{f.label}</label>
                  <input
                    type="text"
                    value={profileForm[f.key]}
                    onChange={e => setProfileForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="input input-sm"
                  />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button type="button" onClick={() => setEditing(false)} className="btn btn-secondary btn-sm" style={{ flex: 1 }}>
                  Отмена
                </button>
                <button type="submit" disabled={savingProfile} className="btn btn-accent btn-sm" style={{ flex: 1 }}>
                  {savingProfile ? '...' : 'Сохранить'}
                </button>
              </div>
            </form>
          )}

          {/* Edit button */}
          {!editing && (
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--color-border)' }}>
              <button onClick={() => setEditing(true)} className="btn btn-secondary btn-sm" style={{ width: '100%' }}>
                Редактировать
              </button>
            </div>
          )}
        </aside>

        {/* Main content */}
        <main style={{ marginLeft: 240, flex: 1, padding: '32px 28px', minHeight: 'calc(100vh - 58px)' }}>
          {children}
        </main>
      </div>
    </div>
  )
}

function SocialLink({ icon, label, value, href, display, placeholder }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span style={{ width: 18, fontSize: 12, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0, marginTop: 1 }}>
        {icon}
      </span>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
          {label}
        </p>
        {value && href ? (
          <a href={href} target="_blank" rel="noreferrer"
            style={{ fontSize: 13, color: 'var(--color-accent)', wordBreak: 'break-all' }}>
            {display || value}
          </a>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>{placeholder}</p>
        )}
      </div>
    </div>
  )
}
