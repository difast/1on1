import { useState, useEffect, useRef } from 'react'
import { getUnreadCount, getNotifications, markRead, markAllRead, updateUser, heartbeat, getUserStats, getTeamMoodSummary, getMeetings, endCall } from '../api/client'
import { supabase } from '../lib/supabase'
import NotificationBell from './NotificationBell'
import PitAssistant from './PitAssistant'
import SupportPage from './SupportPage'
import LegalModal from './LegalModal'

const TOAST_META = {
  new_task:           { icon: '+', color: '#4f46e5' },
  meeting_scheduled:  { icon: '◎', color: '#0061ff' },
  meeting_confirmed:  { icon: '✓', color: '#15803d' },
  meeting_requested:  { icon: '◎', color: '#b45309' },
  meeting_declined:   { icon: '✕', color: '#dc2626' },
  broadcast:          { icon: '!', color: '#ef4444' },
}

export default function Layout({ children, currentUser, onLogout, onUserUpdate, onJoinCall, onNavigate, bannerTasks, bannerTeamId }) {
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [scrolled, setScrolled] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeCallNotif, setActiveCallNotif] = useState(null)
  const [activeCallMeeting, setActiveCallMeeting] = useState(null)
  const [toasts, setToasts] = useState([])
  const shownToastIds = useRef(new Set())
  const isFirstPoll = useRef(true)

  // User menu dropdown
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showSupport, setShowSupport] = useState(false)
  const [showDocs, setShowDocs] = useState(false)
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
  const [sidebarStats, setSidebarStats] = useState(null)
  const [profileForm, setProfileForm] = useState({
    title: currentUser?.title || '',
    telegram: currentUser?.telegram || '',
    linkedin: currentUser?.linkedin || '',
    github: currentUser?.github || '',
  })
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  // ── Deadline banner (inline, replaces DeadlineBanner component) ──────────────
  const [deadlineBanner, setDeadlineBanner] = useState(null)
  const deadlineDismissed = useRef(false)

  useEffect(() => {
    if (deadlineDismissed.current || !bannerTasks?.length) return
    const now = new Date()
    const upcoming = bannerTasks.filter(t => {
      if (!t.due_date || t.completed || t.status === 'done') return false
      const diff = (new Date(t.due_date) - now) / 86400000
      return diff >= 0 && diff <= 2
    })
    if (upcoming.length === 0) return
    deadlineDismissed.current = true
    const first = upcoming[0]
    const diff = Math.ceil((new Date(first.due_date) - now) / 86400000)
    const dueLabel = diff <= 0 ? 'сегодня' : diff === 1 ? 'завтра' : 'послезавтра'
    setDeadlineBanner({
      title: upcoming.length === 1 ? `Срок задачи — ${dueLabel}` : `${upcoming.length} задач истекают скоро`,
      body: (first.title || '').slice(0, 42) + ((first.title || '').length > 42 ? '…' : ''),
      dismissAt: Date.now() + 5000,
    })
  }, [bannerTasks])

  // ── Mood drop banner (inline, replaces MoodDropBanner component) ──────────────
  const [moodBanner, setMoodBanner] = useState(null)
  const moodDismissed = useRef(false)
  const prevBannerTeamId = useRef(null)

  useEffect(() => {
    if (!bannerTeamId) return
    if (prevBannerTeamId.current !== bannerTeamId) {
      moodDismissed.current = false
      prevBannerTeamId.current = bannerTeamId
    }
    if (moodDismissed.current) return
    getTeamMoodSummary(bannerTeamId).then(({ data }) => {
      if (moodDismissed.current) return
      const days = (data.days || []).filter(d => d.avg !== null && d.count > 0)
      if (days.length < 3) return
      const last3 = days.slice(-3)
      if (last3[0].avg > last3[1].avg && last3[1].avg > last3[2].avg) {
        moodDismissed.current = true
        setMoodBanner({ dismissAt: Date.now() + 5000 })
      }
    }).catch(() => {})
  }, [bannerTeamId])

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
                ...fresh.map(n => ({ ...n, dismissAt: Date.now() + 5000 })),
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

  // Persistent "call in progress" bar — shown to lead AND member while the
  // meeting is actually in_progress (both roles checked), the whole call.
  useEffect(() => {
    if (!currentUser?.id) return
    let alive = true
    const poll = async () => {
      try {
        const [a, b] = await Promise.all([
          getMeetings({ member_id: currentUser.id, status: 'in_progress' }).catch(() => ({ data: [] })),
          getMeetings({ team_lead_id: currentUser.id, status: 'in_progress' }).catch(() => ({ data: [] })),
        ])
        const active = [...(a.data || []), ...(b.data || [])]
          .filter(m => m.jitsi_room_url)
          .sort((x, y) => new Date(y.scheduled_date) - new Date(x.scheduled_date))[0] || null
        if (alive) setActiveCallMeeting(active)
      } catch {}
    }
    poll()
    const t = setInterval(poll, 10000)
    return () => { alive = false; clearInterval(t) }
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
    if (!currentUser?.id) return
    getUserStats(currentUser.id).then(r => setSidebarStats(r.data)).catch(() => {})
  }, [currentUser?.id])

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
    const timer = setInterval(() => {
      const now = Date.now()
      setToasts(prev => prev.filter(t => t.dismissAt > now))
      setDeadlineBanner(prev => (prev && prev.dismissAt <= now) ? null : prev)
      setMoodBanner(prev => (prev && prev.dismissAt <= now) ? null : prev)
    }, 500)
    return () => clearInterval(timer)
  }, [])

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            className="mobile-menu-btn"
            aria-label="Меню"
            onClick={() => setSidebarOpen(o => !o)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="logo" style={{ cursor: 'pointer' }} onClick={() => window.location.reload()}>OneOn<span className="accent">One</span></span>
        </div>

        <nav className="nav">
        </nav>

        <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div ref={notifRef} style={{ position: 'relative' }}>
            <NotificationBell count={unreadCount} onClick={toggleNotifications} />

            {/* Notification dropdown — inside notifRef so outside-click logic works correctly */}
            {showNotifications && (
              <div className="notif-dropdown" style={{
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
                    style={{
                      fontSize: 13, color: '#fff', fontWeight: 600,
                      background: unreadCount > 0 ? 'var(--color-accent)' : 'var(--gray-200)',
                      border: 'none', cursor: 'pointer',
                      padding: '4px 12px', borderRadius: 20,
                      animation: unreadCount > 0 ? 'markAllPulse 1.8s ease infinite' : 'none',
                      transition: 'background 0.2s',
                    }}
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
                    notifications.map(n => {
                      const isCall = n.type === 'call_started'
                      const isBroadcast = n.is_broadcast
                      const isUnread = !n.read
                      const handleClick = () => {
                        if (isCall) return
                        if (isUnread) {
                          markRead(n.id).catch(() => {})
                          setUnreadCount(c => Math.max(0, c - 1))
                          setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
                        }
                        setShowNotifications(false)
                        if (onNavigate) onNavigate(n.type)
                      }
                      return (
                        <div
                          key={n.id}
                          onClick={handleClick}
                          style={{
                            padding: '12px 18px', borderBottom: '1px solid var(--color-border)',
                            background: isBroadcast && isUnread
                              ? 'linear-gradient(135deg, #fff1f1, #fff5f5)'
                              : isCall && isUnread
                              ? 'linear-gradient(135deg, var(--blue-50), #eff6ff)'
                              : isUnread ? 'var(--blue-50)' : 'transparent',
                            cursor: isCall ? 'default' : 'pointer',
                            transition: 'background 0.15s',
                            borderLeft: isBroadcast ? '3px solid #ef4444' : isUnread ? '3px solid var(--color-accent)' : '3px solid transparent',
                          }}
                          onMouseEnter={e => { if (!isCall) e.currentTarget.style.background = 'var(--gray-100)' }}
                          onMouseLeave={e => { if (!isCall) e.currentTarget.style.background = isBroadcast && isUnread ? 'linear-gradient(135deg,#fff1f1,#fff5f5)' : isUnread ? 'var(--blue-50)' : 'transparent' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {isBroadcast && (
                                <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', background: '#ef4444', color: '#fff', padding: '1px 6px', borderRadius: 10, marginBottom: 4 }}>
                                  ОБЪЯВЛЕНИЕ
                                </span>
                              )}
                              <p style={{ fontWeight: isUnread ? 600 : 500, fontSize: 14, color: 'var(--color-text-primary)' }}>{n.title}</p>
                              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>{n.body}</p>
                            </div>
                            {isUnread && (
                              <span style={{
                                flexShrink: 0, marginTop: 2,
                                fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                                background: isBroadcast ? '#ef4444' : 'var(--color-accent)', color: '#fff',
                                padding: '2px 7px', borderRadius: 20,
                                whiteSpace: 'nowrap',
                              }}>
                                НОВОЕ
                              </span>
                            )}
                          </div>
                          {isCall && n.data?.room_url && (
                            <button
                              onClick={e => {
                                e.stopPropagation()
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
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>
          {/* My plan stub — team lead only */}
          {user?.role === 'team_lead' && (
            <button
              onClick={() => alert('Скоро появится')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 12, fontWeight: 700, color: '#16a34a',
                padding: '5px 12px', borderRadius: 8,
                border: '1px solid #dcfce7', background: '#f0fdf4', cursor: 'pointer',
                letterSpacing: '0.02em', whiteSpace: 'nowrap',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#dcfce7'}
              onMouseLeave={e => e.currentTarget.style.background = '#f0fdf4'}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
                <rect x="1" y="2.5" width="11" height="8" rx="1.5" stroke="#16a34a" strokeWidth="1.3"/>
                <path d="M1 5.5h11" stroke="#16a34a" strokeWidth="1.1"/>
                <rect x="2.5" y="7.5" width="3" height="1.2" rx="0.4" fill="#16a34a"/>
              </svg>
              <span className="payment-label">Мой тариф</span>
            </button>
          )}

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
              <span className="header-username">{user?.name}</span>
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
                  Сменить пароль
                </MenuItemBtn>
                <MenuItemBtn onClick={toggleDark}>
                  {isDark ? 'Светлая тема' : 'Тёмная тема'}
                </MenuItemBtn>
                <MenuItemBtn onClick={handleSwitchRole}>
                  {switchingRole ? 'Переключение...' : currentUser?.role === 'team_lead' ? 'Войти как участник' : 'Войти как тимлид'}
                </MenuItemBtn>
                <MenuItemBtn onClick={() => { setShowUserMenu(false); setShowSupport(true) }}>
                  Поддержка
                </MenuItemBtn>
                <MenuItemBtn onClick={() => { setShowUserMenu(false); setShowDocs(true) }}>
                  Документы
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

      {/* Active call banner — persists for both lead & member while the call is in progress */}
      {activeCallMeeting && (
        <div className="active-call-bar" style={{
          position: 'fixed', top: 58, left: 240, right: 0, zIndex: 120,
          background: 'var(--color-accent)', color: '#fff',
          padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 14,
          boxShadow: '0 2px 12px rgba(0,97,255,0.3)',
        }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}><rect x="1" y="4" width="11" height="10" rx="2" fill="rgba(255,255,255,0.9)"/><path d="M12 7l5-3v10l-5-3V7z" fill="rgba(255,255,255,0.9)"/></svg>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Идёт созвон</span>
          </div>
          <button
            onClick={() => {
              const url = activeCallMeeting.jitsi_room_url
              const roomName = activeCallMeeting.jitsi_room_name || url.split('/').pop()
              if (onJoinCall) onJoinCall({ room_name: roomName, room_url: url, meeting_id: activeCallMeeting.id })
              else window.open(url, '_blank')
            }}
            style={{
              padding: '6px 18px', fontSize: 13, fontWeight: 700,
              background: '#fff', color: 'var(--color-accent)',
              border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', flexShrink: 0,
            }}
          >
            Войти
          </button>
          <button
            onClick={async () => { try { await endCall(activeCallMeeting.id) } catch {} setActiveCallMeeting(null) }}
            style={{
              padding: '6px 14px', fontSize: 13, fontWeight: 700,
              background: 'transparent', color: '#fff',
              border: '1px solid rgba(255,255,255,0.5)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', flexShrink: 0,
            }}
          >
            Завершить
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

      {/* Unified banner stack — bottom right, covers QuickWidget button */}
      {(toasts.length > 0 || deadlineBanner || moodBanner) && (
        <div className="banner-stack" style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9100,
          display: 'flex', flexDirection: 'column', gap: 10,
          alignItems: 'flex-end',
          pointerEvents: 'none',
        }}>
          {/* Mood drop banner */}
          {moodBanner && (
            <div
              style={{
                pointerEvents: 'all', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderLeft: '4px solid #ef4444',
                borderRadius: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                padding: '12px 14px',
                minWidth: 280, maxWidth: 340,
                animation: 'popIn 0.22s var(--ease-spring)',
              }}
              onClick={() => { setMoodBanner(null); if (onNavigate) onNavigate('meetings') }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
                <polyline points="2,5 7,13 12,9 18,17" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="14,17 18,17 18,13" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.3 }}>Настроение падает 3 дня подряд</p>
                <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 3 }}>Нажмите, чтобы запланировать встречу</p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); setMoodBanner(null) }}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 16, flexShrink: 0, padding: 0, lineHeight: 1 }}
              >✕</button>
            </div>
          )}

          {/* Deadline banner */}
          {deadlineBanner && (
            <div
              style={{
                pointerEvents: 'all', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderLeft: '4px solid #f59e0b',
                borderRadius: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                padding: '12px 14px',
                minWidth: 280, maxWidth: 340,
                animation: 'popIn 0.22s var(--ease-spring)',
              }}
              onClick={() => { setDeadlineBanner(null); if (onNavigate) onNavigate('tasks') }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="10" cy="10" r="8.5" stroke="#f59e0b" strokeWidth="1.5"/>
                <path d="M10 6V10.5L13 12.5" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.3 }}>{deadlineBanner.title}</p>
                <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deadlineBanner.body}</p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); setDeadlineBanner(null) }}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 16, flexShrink: 0, padding: 0, lineHeight: 1 }}
              >✕</button>
            </div>
          )}

          {/* Notification toasts */}
          {toasts.map(t => {
            const meta = TOAST_META[t.type] || { icon: '·', color: '#6b7280' }
            return (
              <div
                key={t.id}
                style={{
                  pointerEvents: 'all', cursor: 'pointer',
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  background: 'var(--color-surface)',
                  border: `1px solid ${meta.color}33`,
                  borderLeft: `4px solid ${meta.color}`,
                  borderRadius: 12,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                  padding: '12px 14px',
                  minWidth: 280, maxWidth: 340,
                  animation: 'popIn 0.22s var(--ease-spring)',
                }}
                onClick={() => {
                  markRead(t.id).catch(() => {})
                  setUnreadCount(c => Math.max(0, c - 1))
                  setToasts(prev => prev.filter(x => x.id !== t.id))
                  setNotifications(prev => prev.map(n => n.id === t.id ? { ...n, read: true } : n))
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
                >✕</button>
              </div>
            )
          })}
        </div>
      )}

      {/* Body: sidebar + main */}
      <div style={{ display: 'flex' }}>
        {/* Mobile backdrop */}
        <div
          className={`sidebar-backdrop${sidebarOpen ? ' open' : ''}`}
          onClick={() => setSidebarOpen(false)}
        />
        {/* Sidebar */}
        <aside className={`app-sidebar${sidebarOpen ? ' open' : ''}`} style={{
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

          {/* Social links + stats */}
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

              {/* Mini stats */}
              <div style={{ marginTop: 6, paddingTop: 14, borderTop: '1px solid var(--color-border)' }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                  Статистика
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {[
                    { value: sidebarStats?.meetings, label: 'Встреч', color: '#4f46e5', bg: 'var(--color-bg-secondary, #f1f5f9)' },
                    { value: sidebarStats?.teams, label: 'Команд', color: '#0891b2', bg: 'var(--color-bg-secondary, #f1f5f9)' },
                    { value: sidebarStats?.tasks_done, label: 'Задач', color: '#16a34a', bg: 'var(--color-bg-secondary, #f1f5f9)' },
                  ].map(s => (
                    <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: '9px 4px', textAlign: 'center', border: '1px solid var(--color-border)' }}>
                      <p style={{ fontSize: 17, fontWeight: 800, color: s.color, lineHeight: 1.1 }}>
                        {sidebarStats ? (s.value ?? 0) : '—'}
                      </p>
                      <p style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2 }}>{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
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

          {/* App download buttons */}
          <div style={{ padding: '12px 20px 16px', borderTop: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
              Приложения
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <StoreBtn compact title="App Store" icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
              } />
              <StoreBtn compact title="Google Play" icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3.18 23.76c.35.19.75.24 1.15.12l12.48-7.2-2.64-2.64-10.99 9.72zm-1.56-20.4C1.27 3.7 1 4.12 1 4.68v14.64c0 .56.27.98.62 1.32l.08.07 8.2-8.2v-.19L1.62 3.29zM20.1 10.26l-2.56-1.48-2.92 2.92 2.92 2.92 2.58-1.49c.74-.42.74-1.44-.02-1.87zM4.33.12L16.81 7.32l-2.64 2.64L3.18.24C3.58.12 3.98.17 4.33.36z"/></svg>
              } />
              <StoreBtn compact title="RuStore" href="https://www.rustore.ru/catalog/app/com.oneonone.app" icon={
                <svg width="18" height="18" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="9" fill="#0077FF"/><path d="M10 12h10.5c3.6 0 6 2 6 5.2 0 2.2-1.1 3.9-2.9 4.7l3.4 6.1h-4.2l-2.9-5.4H13.8V28H10V12zm3.8 7.5h6.4c1.5 0 2.4-.8 2.4-2.2s-.9-2.2-2.4-2.2h-6.4v4.4z" fill="white"/></svg>
              } />
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="app-main" style={{ marginLeft: 240, flex: 1, minWidth: 0, padding: '32px 28px', minHeight: 'calc(100vh - 58px)' }}>
          {children}
        </main>
      </div>
      <PitAssistant />
      {showSupport && <SupportPage currentUser={currentUser} onClose={() => setShowSupport(false)} />}
      <LegalModal open={showDocs} onClose={() => setShowDocs(false)} />
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

function StoreBtn({ label, title, icon, href, compact }) {
  const base = compact
    ? {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flex: 1, height: 40, borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--color-border)', background: 'var(--color-surface)',
        color: 'var(--color-text-primary)', textDecoration: 'none',
      }
    : {
        display: 'flex', alignItems: 'center', gap: 9, width: '100%',
        padding: '8px 10px', borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--color-border)', background: 'var(--color-surface)',
        color: 'var(--color-text-primary)', fontSize: 12, fontWeight: 600,
        textDecoration: 'none', textAlign: 'left',
      }
  const inner = compact ? icon : <>{icon}<span style={{ flex: 1 }}>{label}</span></>
  if (href) {
    return (
      <a href={href} title={title || label} target="_blank" rel="noopener noreferrer" style={{ ...base, cursor: 'pointer' }}>
        {inner}
      </a>
    )
  }
  // Stores not published yet — graceful placeholder.
  return (
    <button type="button" title={(title || label) + ' — появится позже'} onClick={() => alert('Появится позже')}
      style={{ ...base, opacity: 0.55, cursor: 'pointer' }}>
      {inner}
      {!compact && <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-muted)' }}>скоро</span>}
    </button>
  )
}
