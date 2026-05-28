import { useState, useEffect, useRef } from 'react'
import { getUnreadCount, getNotifications, markRead, markAllRead, updateUser, heartbeat } from '../api/client'
import { supabase } from '../lib/supabase'
import NotificationBell from './NotificationBell'

const TOAST_META = {
  new_task:           { icon: '+', color: '#4f46e5' },
  meeting_scheduled:  { icon: '◎', color: '#0061ff' },
  meeting_confirmed:  { icon: '✓', color: '#15803d' },
  meeting_requested:  { icon: '◎', color: '#b45309' },
  meeting_declined:   { icon: '✕', color: '#dc2626' },
}

export default function Layout({ children, currentUser, onLogout, onUserUpdate, onJoinCall, onNavigate, onKnowledgeBase }) {
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [scrolled, setScrolled] = useState(false)
  const [activeCallNotif, setActiveCallNotif] = useState(null)
  const [toasts, setToasts] = useState([])
  const shownToastIds = useRef(new Set())
  const isFirstPoll = useRef(true)

  // User menu dropdown
  const [showUserMenu, setShowUserMenu] = useState(false)
  const userMenuRef = useRef(null)
  const notifRef = useRef(null)
  const [switchingRole, setSwitchingRole] = useState(false)

  // Dark theme — per-user preference; defaults to dark when no preference stored
  const themeKey = (id) => `web_theme_${id}`
  const [isDark, setIsDark] = useState(() => {
    if (!currentUser?.id) return true
    const saved = localStorage.getItem(themeKey(currentUser.id))
    return saved !== null ? saved === 'dark' : true
  })

  // Password change modal
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [pwdNew, setPwdNew] = useState('')
  const [pwdConfirm, setPwdConfirm] = useState('')
  const [pwdError, setPwdError] = useState('')
  const [pwdSuccess, setPwdSuccess] = useState('')
  const [pwdLoading, setPwdLoading] = useState(false)

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
    if (!currentUser?.id) return
    let lastCount = 0
    const checkNotifs = async () => {
      try {
        const { data } = await getUnreadCount(currentUser.id)
        const count = data.unread_count
        setUnreadCount(count)
        if (count > lastCount) {
          const { data: notifs } = await getNotifications(currentUser.id, true)
          setNotifications(prev => {
            const ids = new Set(prev.map(n => n.id))
            return [...notifs.filter(n => !ids.has(n.id)), ...prev]
          })
          const call = notifs.find(n => n.type === 'call_started' && n.data?.room_url)
          if (call) setActiveCallNotif(call)

          if (isFirstPoll.current) {
            notifs.forEach(n => shownToastIds.current.add(n.id))
          } else {
            const fresh = notifs.filter(n => n.type !== 'call_started' && !shownToastIds.current.has(n.id))
            if (fresh.length > 0) {
              fresh.forEach(n => shownToastIds.current.add(n.id))
              setToasts(prev => [
                ...fresh.map(n => ({ ...n, dismissAt: Date.now() + 6000 })),
                ...prev,
              ].slice(0, 5))
            }
          }
        }
        isFirstPoll.current = false
        lastCount = count
      } catch {}
    }
    checkNotifs()
    const interval = setInterval(checkNotifs, 20000)
    return () => clearInterval(interval)
  }, [currentUser?.id])

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

  // When the active user changes, load their personal theme preference
  useEffect(() => {
    if (!currentUser?.id) return
    const saved = localStorage.getItem(themeKey(currentUser.id))
    setIsDark(saved !== null ? saved === 'dark' : true)
  }, [currentUser?.id])

  useEffect(() => {
    if (isDark) document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
  }, [isDark])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false)
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (toasts.length === 0) return
    const timer = setInterval(() => {
      setToasts(prev => prev.filter(t => t.dismissAt > Date.now()))
    }, 1000)
    return () => clearInterval(timer)
  }, [toasts.length])

  useEffect(() => {
    if (!currentUser?.id) return
    heartbeat(currentUser.id).catch(() => {})
    const t = setInterval(() => heartbeat(currentUser.id).catch(() => {}), 60000)
    return () => clearInterval(t)
  }, [currentUser?.id])

  const handleSwitchRole = async () => {
    if (!currentUser?.id || switchingRole) return
    const newRole = currentUser.role === 'team_lead' ? 'member' : 'team_lead'
    setSwitchingRole(true)
    try {
      await updateUser(currentUser.id, { role: newRole })
      const updated = { ...currentUser, role: newRole }
      localStorage.setItem('smart_user', JSON.stringify(updated))
      if (onUserUpdate) onUserUpdate(updated)
    } catch { } finally {
      setSwitchingRole(false)
      setShowUserMenu(false)
    }
  }

  const toggleDark = () => {
    const next = !isDark
    setIsDark(next)
    if (currentUser?.id) localStorage.setItem(themeKey(currentUser.id), next ? 'dark' : 'light')
    setShowUserMenu(false)
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (pwdNew !== pwdConfirm) { setPwdError('Пароли не совпадают'); return }
    if (pwdNew.length < 6) { setPwdError('Пароль должен быть не менее 6 символов'); return }
    setPwdLoading(true)
    setPwdError('')
    try {
      const { error } = await supabase.auth.updateUser({ password: pwdNew })
      if (error) { setPwdError(error.message); return }
      setPwdSuccess('Пароль успешно изменён')
      setPwdNew(''); setPwdConfirm('')
      setTimeout(() => { setShowPasswordModal(false); setPwdSuccess('') }, 1500)
    } catch { setPwdError('Произошла ошибка') } finally { setPwdLoading(false) }
  }

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
          <div ref={notifRef} style={{ position: 'relative' }}>
            <NotificationBell count={unreadCount} onClick={toggleNotifications} />

            {/* Notification dropdown — inside notifRef so outside-click logic works correctly */}
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
                          background: n.type === 'call_started' && !n.read
                            ? 'linear-gradient(135deg, var(--blue-50), #eff6ff)'
                            : !n.read ? 'var(--blue-50)' : 'transparent',
                          transition: 'background 0.15s',
                        }}
                      >
                        <p style={{ fontWeight: 500, fontSize: 14, color: 'var(--color-text-primary)' }}>{n.title}</p>
                        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>{n.body}</p>
                        {n.type === 'call_started' && n.data?.room_url && (
                          <button
                            onClick={() => {
                              const url = n.data.room_url
                              const roomName = url.split('/').pop()
                              if (onJoinCall) onJoinCall({ room_name: roomName, room_url: url, meeting_id: null })
                              else window.open(url, '_blank')
                              markRead(n.id).catch(() => {})
                              setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
                              setUnreadCount(c => Math.max(0, c - 1))
                              if (activeCallNotif?.id === n.id) setActiveCallNotif(null)
                            }}
                            style={{
                              marginTop: 8, padding: '5px 14px', fontSize: 13, fontWeight: 600,
                              background: 'var(--color-accent)', color: '#fff',
                              border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                            }}
                          >
                            Присоединиться →
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          <div ref={userMenuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowUserMenu(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 14, fontWeight: 500, color: 'var(--color-text-secondary)',
                padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                border: '1px solid transparent', background: 'none', cursor: 'pointer',
                transition: 'all 150ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--gray-100)'; e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
            >
              {user?.name}
              <span style={{ fontSize: 9, opacity: 0.5, marginLeft: 2 }}>▾</span>
            </button>

            {showUserMenu && (
              <div style={{
                position: 'absolute', right: 0, top: 'calc(100% + 6px)', minWidth: 210,
                background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
                overflow: 'hidden', animation: 'popIn 0.18s var(--ease-spring)', zIndex: 200,
              }}>
                <MenuItemBtn onClick={() => { setShowUserMenu(false); setShowPasswordModal(true); setPwdError(''); setPwdSuccess(''); setPwdNew(''); setPwdConfirm('') }}>
                  🔑 Сменить пароль
                </MenuItemBtn>
                <MenuItemBtn onClick={toggleDark}>
                  {isDark ? 'Светлая тема' : 'Тёмная тема'}
                </MenuItemBtn>
                <MenuItemBtn onClick={handleSwitchRole}>
                  {switchingRole ? 'Переключение...' : currentUser?.role === 'team_lead' ? 'Войти как участник' : 'Войти как тимлид'}
                </MenuItemBtn>
                <MenuItemBtn onClick={() => { setShowUserMenu(false); onKnowledgeBase?.() }}>
                  База знаний
                </MenuItemBtn>
                <MenuItemBtn onClick={() => setShowUserMenu(false)}>
                  Помощь
                </MenuItemBtn>
                <div style={{ height: 1, background: 'var(--color-border)', margin: '3px 0' }} />
                <MenuItemBtn danger onClick={() => { setShowUserMenu(false); onLogout?.() }}>
                  Выйти
                </MenuItemBtn>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Active call banner */}
      {activeCallNotif && (
        <div style={{
          position: 'fixed', top: 58, left: 240, right: 0, zIndex: 120,
          background: 'var(--color-accent)', color: '#fff',
          padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 16,
          boxShadow: '0 2px 12px rgba(0,97,255,0.3)',
        }}>
          <span style={{ fontSize: 18 }}>📹</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{activeCallNotif.title}</span>
          </div>
          <button
            onClick={() => {
              const url = activeCallNotif.data.room_url
              const roomName = url.split('/').pop()
              if (onJoinCall) onJoinCall({ room_name: roomName, room_url: url, meeting_id: null })
              else window.open(url, '_blank')
              markRead(activeCallNotif.id).catch(() => {})
              setActiveCallNotif(null)
            }}
            style={{
              padding: '6px 18px', fontSize: 13, fontWeight: 700,
              background: '#fff', color: 'var(--color-accent)',
              border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Присоединиться
          </button>
          <button
            onClick={() => setActiveCallNotif(null)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 18, flexShrink: 0, padding: 4 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Password change modal */}
      {showPasswordModal && (
        <div className="overlay-center" onClick={() => setShowPasswordModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <span className="modal-title">Сменить пароль</span>
              <button className="modal-close" onClick={() => setShowPasswordModal(false)}>✕</button>
            </div>
            {pwdSuccess ? (
              <p style={{ color: 'var(--color-success)', fontSize: 14, textAlign: 'center', padding: '16px 0' }}>
                ✓ {pwdSuccess}
              </p>
            ) : (
              <form onSubmit={handleChangePassword}>
                <div className="form-group">
                  <label className="form-label">Новый пароль</label>
                  <input
                    type="password" className="input" value={pwdNew}
                    onChange={e => setPwdNew(e.target.value)}
                    required minLength={6} placeholder="Минимум 6 символов"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Подтвердите пароль</label>
                  <input
                    type="password" className="input" value={pwdConfirm}
                    onChange={e => setPwdConfirm(e.target.value)}
                    required minLength={6} placeholder="Повторите пароль"
                  />
                </div>
                {pwdError && (
                  <p style={{ fontSize: 13, color: 'var(--color-danger)', marginBottom: 12 }}>{pwdError}</p>
                )}
                <button type="submit" className="btn btn-accent" style={{ width: '100%' }} disabled={pwdLoading}>
                  {pwdLoading ? 'Сохранение...' : 'Сохранить пароль'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Toast stack — bottom right */}
      {toasts.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9000,
          display: 'flex', flexDirection: 'column-reverse', gap: 10,
          pointerEvents: 'none',
        }}>
          {toasts.map(t => {
            const meta = TOAST_META[t.type] || { icon: '🔔', color: '#6b7280' }
            return (
              <div
                key={t.id}
                style={{
                  pointerEvents: 'all',
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  background: 'var(--color-surface)',
                  border: `1px solid ${meta.color}33`,
                  borderLeft: `4px solid ${meta.color}`,
                  borderRadius: 12,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                  padding: '12px 14px',
                  minWidth: 280, maxWidth: 340,
                  cursor: 'pointer',
                  animation: 'popIn 0.22s var(--ease-spring)',
                }}
                onClick={() => {
                  setToasts(prev => prev.filter(x => x.id !== t.id))
                  if (onNavigate) onNavigate(t.type)
                }}
              >
                <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{meta.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.3 }}>{t.title}</p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 3, lineHeight: 1.4 }}>{t.body}</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setToasts(prev => prev.filter(x => x.id !== t.id)) }}
                  style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 16, flexShrink: 0, padding: 0, lineHeight: 1 }}
                >
                  ✕
                </button>
              </div>
            )
          })}
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
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    {uploadingAvatar
                      ? <circle cx="8" cy="8" r="6" stroke="#fff" strokeWidth="1.5" strokeDasharray="10 6" />
                      : <><path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h.75L5.25 2.5h5.5L11.75 4h.75A1.5 1.5 0 0 1 14 5.5v6A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5v-6z" stroke="#fff" strokeWidth="1.2"/><circle cx="8" cy="8.5" r="2" stroke="#fff" strokeWidth="1.2"/></>
                    }
                  </svg>
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

function MenuItemBtn({ children, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', padding: '10px 16px',
        fontSize: 14, fontWeight: 500,
        color: danger ? 'var(--color-danger)' : 'var(--color-text-primary)',
        background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 10,
        transition: 'background 120ms',
      }}
      onMouseEnter={e => e.currentTarget.style.background = danger ? 'var(--color-danger-bg)' : 'var(--gray-100)'}
      onMouseLeave={e => e.currentTarget.style.background = 'none'}
    >
      {children}
    </button>
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
