import { useState, useEffect, useRef } from 'react'
import { getUnreadCount, getNotifications, markRead, markAllRead, updateUser, heartbeat, getUserStats, getClosedTodayTasks, getTeamMoodSummary, getMeetings, endCall, telegramLink, getTelegramConfig, authChangePassword, authResendConfirmation, authAddEmail } from '../api/client'
import NotificationBell from './NotificationBell'
import PitAssistant from './PitAssistant'
import SupportPage from './SupportPage'
import KnowledgeBasePage from './KnowledgeBasePage'
import LegalModal from './LegalModal'
import Billing from './Billing'
import WelcomeTour from './WelcomeTour'
import AvatarCropModal from './AvatarCropModal'
import { coachingEnabled, setCoaching } from '../lib/coaching'
import { toast } from '../lib/ui'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGS } from '../i18n'
import { useSurface } from '../lib/surface'

const TOAST_META = {
  new_task:           { icon: '+', color: '#4f46e5' },
  meeting_scheduled:  { icon: '◎', color: '#0061ff' },
  meeting_confirmed:  { icon: '✓', color: '#15803d' },
  meeting_requested:  { icon: '◎', color: '#b45309' },
  meeting_declined:   { icon: '✕', color: '#dc2626' },
  broadcast:          { icon: '!', color: '#ef4444' },
}

export default function Layout({ children, currentUser, onLogout, onUserUpdate, onJoinCall, onNavigate, bannerTasks, bannerTeamId }) {
  const { t, i18n } = useTranslation()
  const surface = useSurface()
  const isTg = surface === 'telegram'  // Mini App: скрываем запрещённые таблицей разделы
  const [showLangMenu, setShowLangMenu] = useState(false)
  // Привязка Telegram по коду из бота (Этап 4).
  const [showTgModal, setShowTgModal] = useState(false)
  const [tgCode, setTgCode] = useState('')
  const [tgBusy, setTgBusy] = useState(false)
  const [tgErr, setTgErr] = useState('')
  const [tgEnabled, setTgEnabled] = useState(false)
  useEffect(() => { getTelegramConfig().then(r => setTgEnabled(!!r.data?.enabled)).catch(() => {}) }, [])

  const handleTelegramLink = async (e) => {
    e.preventDefault()
    setTgErr(''); setTgBusy(true)
    try {
      const { data } = await telegramLink(currentUser.id, tgCode.trim())
      onUserUpdate?.(data.user)
      setShowTgModal(false); setTgCode('')
      toast('Telegram привязан к аккаунту', 'success')
    } catch (err) {
      setTgErr(err?.response?.data?.detail || 'Не удалось привязать')
    } finally { setTgBusy(false) }
  }
  // Смена языка: применяем сразу + сохраняем в профиль, чтобы не определять
  // заново при следующем визите (Этап 6). i18next сам кладёт выбор в localStorage.
  const changeLanguage = (code) => {
    i18n.changeLanguage(code)
    setShowLangMenu(false)
    if (currentUser?.id) {
      updateUser(currentUser.id, { preferred_language: code }).catch(() => {})
    }
  }
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
  const [showRoleConfirm, setShowRoleConfirm] = useState(false)
  const [showKnowledge, setShowKnowledge] = useState(false)
  const [showSupport, setShowSupport] = useState(false)
  const [showDocs, setShowDocs] = useState(false)
  const [showBilling, setShowBilling] = useState(false)
  const [billingPlan, setBillingPlan] = useState(null)

  // Open "Мой тариф" automatically when arriving from the landing/app (?upgrade=1).
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search)
      if (q.get('upgrade') === '1' || window.location.pathname.includes('/billing')) {
        setBillingPlan(q.get('plan') || null)
        setShowBilling(true)
        // clean the URL so refresh doesn't reopen
        window.history.replaceState({}, '', window.location.pathname)
      }
    } catch {}
  }, [])
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
  const [pwdCurrent, setPwdCurrent] = useState('')
  const [pwdNew, setPwdNew] = useState('')
  const [pwdConfirm, setPwdConfirm] = useState('')
  const [pwdError, setPwdError] = useState('')
  const [pwdSuccess, setPwdSuccess] = useState('')
  const [pwdLoading, setPwdLoading] = useState(false)

  // Подтверждение email: баннер (только для тех, у кого есть email и он не
  // подтверждён) и добавление email (для входа только через Telegram).
  const [emailBannerHidden, setEmailBannerHidden] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [showAddEmailModal, setShowAddEmailModal] = useState(false)
  const [addEmailVal, setAddEmailVal] = useState('')
  const [addEmailErr, setAddEmailErr] = useState('')
  const [addEmailLoading, setAddEmailLoading] = useState(false)

  // Profile sidebar edit state
  const [editing, setEditing] = useState(false)
  const [sidebarStats, setSidebarStats] = useState(null)
  // Закрытые сегодня задачи (Задача 2): модалка со списком по клику на счётчик.
  const [showClosedToday, setShowClosedToday] = useState(false)
  const [closedTasks, setClosedTasks] = useState(null)
  const [profileForm, setProfileForm] = useState({
    title: currentUser?.title || '',
    telegram: currentUser?.telegram || '',
    linkedin: currentUser?.linkedin || '',
    github: currentUser?.github || '',
  })
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [showAvatarModal, setShowAvatarModal] = useState(false)

  // Переключатель встроенного AI-коучинга. Живёт в меню настроек рядом с темой —
  // не в отдельном разделе, — потому что это тумблер поведения продукта, а не
  // самостоятельная функция. Выключенный коучинг оставляет чистый органайзер встреч.
  const [coachOn, setCoachOn] = useState(() => coachingEnabled(currentUser?.id))
  useEffect(() => { setCoachOn(coachingEnabled(currentUser?.id)) }, [currentUser?.id])
  const toggleCoaching = () => {
    const next = !coachOn
    setCoachOn(next)
    setCoaching(currentUser?.id, next)
    // Как и тема — тумблер на месте, меню остаётся открытым.
  }

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

  // Статистика сайдбара, включая «Закрыто сегодня» (Задача 2). Обновляется в
  // реальном времени: (1) по событию 'tasks-updated' — когда пользователь сам
  // меняет статус задачи (мгновенно, без refresh); (2) фоновым поллингом —
  // чтобы тимлид видел закрытия других участников команды в течение дня.
  useEffect(() => {
    if (!currentUser?.id) return
    const refreshStats = () => getUserStats(currentUser.id).then(r => setSidebarStats(r.data)).catch(() => {})
    refreshStats()
    const onTasksUpdated = () => refreshStats()
    window.addEventListener('tasks-updated', onTasksUpdated)
    const poll = setInterval(refreshStats, 30000)
    return () => {
      window.removeEventListener('tasks-updated', onTasksUpdated)
      clearInterval(poll)
    }
  }, [currentUser?.id])

  // Если открыта модалка «Закрыто сегодня» — держим список в актуальном виде.
  const loadClosedToday = () => {
    if (!currentUser?.id) return
    setClosedTasks(null)
    getClosedTodayTasks(currentUser.id).then(r => setClosedTasks(r.data || [])).catch(() => setClosedTasks([]))
  }
  const openClosedToday = () => { setShowClosedToday(true); loadClosedToday() }

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

  // Смена роли меняет саму роль аккаунта в БД (а не только представление),
  // поэтому спрашиваем подтверждение — чтобы пункт меню не переключал контекст
  // случайным кликом. Само действие вынесено в confirmSwitchRole.
  const requestSwitchRole = () => {
    if (!currentUser?.id || switchingRole) return
    setShowUserMenu(false)
    setShowRoleConfirm(true)
  }

  const confirmSwitchRole = async () => {
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
      setShowRoleConfirm(false)
    }
  }

  const toggleDark = () => {
    const next = !isDark
    setIsDark(next)
    if (currentUser?.id) localStorage.setItem(themeKey(currentUser.id), next ? 'dark' : 'light')
    // Меню НЕ закрываем: тумблер меняет состояние прямо на месте, пользователь
    // должен увидеть, как переключатель встал в новое положение.
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (pwdNew !== pwdConfirm) { setPwdError('Пароли не совпадают'); return }
    if (pwdNew.length < 8 || !/[A-Za-zА-Яа-я]/.test(pwdNew) || !/\d/.test(pwdNew)) {
      setPwdError('Пароль должен быть не короче 8 символов и содержать буквы и цифры'); return
    }
    setPwdLoading(true)
    setPwdError('')
    try {
      await authChangePassword({
        user_id: currentUser.id,
        current_password: pwdCurrent,
        new_password: pwdNew,
      })
      setPwdSuccess('Пароль изменён')
      setPwdCurrent(''); setPwdNew(''); setPwdConfirm('')
      setTimeout(() => { setShowPasswordModal(false); setPwdSuccess('') }, 1500)
    } catch (err) {
      setPwdError(err?.response?.data?.detail || 'Не удалось изменить пароль')
    } finally { setPwdLoading(false) }
  }

  const handleResendConfirmation = async () => {
    if (!currentUser?.id) return
    setResendLoading(true)
    try {
      await authResendConfirmation({ user_id: currentUser.id })
      toast('Письмо отправлено. Проверьте почту.')
    } catch {
      toast('Не удалось отправить письмо')
    } finally { setResendLoading(false) }
  }

  const handleAddEmail = async (e) => {
    e.preventDefault()
    setAddEmailErr('')
    setAddEmailLoading(true)
    try {
      const { data } = await authAddEmail(currentUser.id, addEmailVal.trim())
      onUserUpdate?.(data)
      setShowAddEmailModal(false)
      setAddEmailVal('')
      toast('Email добавлен. Проверьте почту для подтверждения.')
    } catch (err) {
      setAddEmailErr(err?.response?.data?.detail || 'Не удалось добавить email')
    } finally { setAddEmailLoading(false) }
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

  // Сохранение уже кадрированного (в модалке) фото. Обновляем сразу везде через
  // onUserUpdate + localStorage — та же логика моментального обновления, что и в
  // остальном профиле; отдельная страница не перезагружается.
  const handleAvatarSave = async (base64) => {
    if (!base64 || !currentUser?.id) return
    setUploadingAvatar(true)
    try {
      await updateUser(currentUser.id, { avatar: base64 })
      const stored = localStorage.getItem('smart_user')
      const u = stored ? JSON.parse(stored) : {}
      const merged = { ...u, avatar: base64 }
      localStorage.setItem('smart_user', JSON.stringify(merged))
      if (onUserUpdate) onUserUpdate(merged)
      try { window.dispatchEvent(new Event('profile-updated')) } catch {}
      setShowAvatarModal(false)
      toast('Фото профиля обновлено', 'success')
    } catch {
      toast('Не удалось обновить фото', 'error')
    } finally {
      setUploadingAvatar(false)
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
          <span className="logo" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }} onClick={() => window.location.reload()}>
            <img src="/favicon.png" alt="" style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, marginRight: 8 }} />
            <span>OneOn<span className="accent">One</span></span>
          </span>
        </div>

        <nav className="nav">
        </nav>

        <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div ref={notifRef} data-tour="notifications" style={{ position: 'relative' }}>
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
          {/* My plan — team lead only. В Mini App биллинг недоступен (таблица). */}
          {user?.role === 'team_lead' && !isTg && (
            <button
              onClick={() => setShowBilling(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 12, fontWeight: 700, color: '#fff',
                padding: '6px 14px', borderRadius: 99,
                border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-hover))',
                boxShadow: 'var(--shadow-blue)', letterSpacing: '0.02em', whiteSpace: 'nowrap',
                transition: 'transform 0.15s var(--ease-spring), box-shadow 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = 'var(--shadow-blue-lg)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--shadow-blue)' }}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                <path d="M7 1l1.7 3.6L12.5 5l-2.9 2.7.7 4L7 9.8 3.7 11.7l.7-4L1.5 5l3.8-.4L7 1z" fill="#fff"/>
              </svg>
              <span className="payment-label">Мой тариф</span>
            </button>
          )}

          <div ref={userMenuRef} data-tour="menu" style={{ position: 'relative' }}>
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
              /*
               * Меню профиля сгруппировано по ТИПУ действия, а не свалено в
               * плоский список. Порядок групп — сверху вниз по частоте и «весу»:
               *  1. Шапка-идентификация (кто я) — контекст, особенно рядом со
               *     сменой роли ниже.
               *  2. Настройки: смена пароля + быстрые тумблеры (тема, подсказки).
               *     Тумблеры оставлены прямо в меню, т.к. это действия «в один
               *     клик» — выносить их в отдельный экран было бы лишним шагом.
               *  3. Режим: смена представления (тимлид/участник) отделена — это
               *     не настройка, а переключение рабочего контекста.
               *  4. Помощь: поддержка и документы.
               *  5. Выход — всегда внизу, деструктивный акцент.
               * Отдельная страница «Настройки» НЕ заводится намеренно: после
               * группировки в меню всего 6 пунктов, вынос 1-2 из них в отдельный
               * экран только добавил бы навигационный хоп и оголил меню.
               */
              <div style={{
                position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 268,
                background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
                overflow: 'hidden', animation: 'popIn 0.18s var(--ease-spring)', zIndex: 200,
                padding: 6,
              }}>
                {/* 1. Идентификация */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px 10px' }}>
                  <div className={`avatar avatar-sm ${user?.avatar ? '' : 'avatar-accent'}`} style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0 }}>
                    {user?.avatar
                      ? <img src={user.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                      : initial}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name || '—'}</p>
                    <p style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {user?.email || (user?.role === 'team_lead' ? 'Тимлид' : 'Участник')}
                    </p>
                  </div>
                </div>
                <MenuDivider />

                {/* 2. Настройки: действие + быстрые тумблеры */}
                {/* Смена пароля — только если у аккаунта есть пароль. У входа
                    только через Telegram пароля нет, поэтому пункт скрыт. */}
                {currentUser?.has_password && (
                  <MenuItemBtn icon={<IconLock />} onClick={() => { setShowUserMenu(false); setShowPasswordModal(true); setPwdError(''); setPwdSuccess(''); setPwdCurrent(''); setPwdNew(''); setPwdConfirm('') }}>
                    Сменить пароль
                  </MenuItemBtn>
                )}
                {/* Добавить email — ненавязчивое предложение для тех, кто вошёл
                    только через Telegram и не указывал почту. */}
                {!currentUser?.email && (
                  <MenuItemBtn icon={<IconSend />} onClick={() => { setShowUserMenu(false); setShowAddEmailModal(true); setAddEmailErr(''); setAddEmailVal('') }}>
                    Добавить email
                  </MenuItemBtn>
                )}
                {/* Привязка Telegram — только если бот включён и ещё не привязан */}
                {tgEnabled && !currentUser?.telegram_id && (
                  <MenuItemBtn icon={<IconSend />} onClick={() => { setShowUserMenu(false); setShowTgModal(true); setTgErr(''); setTgCode('') }}>
                    Привязать Telegram
                  </MenuItemBtn>
                )}
                {/* Тумблер = «тёмная тема вкл»: привычная модель dark mode switch. */}
                <MenuItemBtn icon={isDark ? <IconMoon /> : <IconSun />} onClick={toggleDark} right={<Toggle on={isDark} />}>
                  Тема оформления
                </MenuItemBtn>
                <MenuItemBtn icon={<IconHelpHint />} onClick={toggleCoaching} right={<Toggle on={coachOn} />}>
                  Подсказки Пита
                </MenuItemBtn>
                {/* Переключатель языка (Этап 6). Раскрывается на месте — три локали. */}
                <MenuItemBtn
                  icon={<IconGlobe />}
                  onClick={() => setShowLangMenu(v => !v)}
                  right={<span style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{(i18n.resolvedLanguage || i18n.language || 'ru').slice(0, 2)}</span>}
                >
                  {t('menu.language')}
                </MenuItemBtn>
                {showLangMenu && (
                  <div style={{ padding: '2px 0 4px 28px', display: 'flex', flexDirection: 'column' }}>
                    {SUPPORTED_LANGS.map(l => {
                      const active = (i18n.resolvedLanguage || i18n.language || 'ru').slice(0, 2) === l.code
                      return (
                        <button key={l.code} onClick={() => changeLanguage(l.code)} style={{
                          textAlign: 'left', padding: '7px 10px', fontSize: 13,
                          fontWeight: active ? 700 : 500,
                          color: active ? 'var(--color-accent)' : 'var(--color-text-primary)',
                          background: 'none', border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-sm)',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--gray-100)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                          {l.label}
                        </button>
                      )
                    })}
                  </div>
                )}
                <MenuDivider />

                {/* 3. Режим работы — смена представления, а не настройка */}
                <MenuItemBtn icon={<IconSwitch />} subtext="Переключить представление" onClick={requestSwitchRole}>
                  {switchingRole ? 'Переключение…' : currentUser?.role === 'team_lead' ? 'Войти как участник' : 'Войти как тимлид'}
                </MenuItemBtn>
                <MenuDivider />

                {/* 4. Помощь и информация */}
                <MenuItemBtn icon={<IconBook />} onClick={() => { setShowUserMenu(false); setShowKnowledge(true) }}>
                  База знаний
                </MenuItemBtn>
                <MenuItemBtn icon={<IconLifebuoy />} onClick={() => { setShowUserMenu(false); setShowSupport(true) }}>
                  Поддержка
                </MenuItemBtn>
                <MenuItemBtn icon={<IconDoc />} onClick={() => { setShowUserMenu(false); setShowDocs(true) }}>
                  Документы
                </MenuItemBtn>
                <MenuDivider />

                {/* 5. Выход */}
                <MenuItemBtn danger icon={<IconLogout />} onClick={() => { setShowUserMenu(false); onLogout?.() }}>
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

      {/* Role switch confirmation — смена роли меняет доступ, подтверждаем осознанно */}
      {showRoleConfirm && (
        <div className="overlay-center" onClick={() => !switchingRole && setShowRoleConfirm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <span className="modal-title">
                {currentUser?.role === 'team_lead' ? 'Перейти в режим участника?' : 'Перейти в режим тимлида?'}
              </span>
              <button className="modal-close" aria-label="Закрыть" onClick={() => setShowRoleConfirm(false)} disabled={switchingRole}>✕</button>
            </div>
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
              {currentUser?.role === 'team_lead'
                ? 'Вы переключитесь на представление участника. Управление командой и аналитика станут недоступны, пока не вернётесь обратно.'
                : 'Вы переключитесь на представление тимлида — с командами, встречами и аналитикой. Вернуться можно так же через это меню.'}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowRoleConfirm(false)} disabled={switchingRole}>Отмена</button>
              <button className="btn btn-accent" style={{ flex: 1 }} onClick={confirmSwitchRole} disabled={switchingRole}>
                {switchingRole ? 'Переключение…' : 'Переключить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password change modal */}
      {showPasswordModal && (
        <div className="overlay-center" onClick={() => setShowPasswordModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <span className="modal-title">Сменить пароль</span>
              <button className="modal-close" aria-label="Закрыть" onClick={() => setShowPasswordModal(false)}>✕</button>
            </div>
            {pwdSuccess ? (
              <p style={{ color: 'var(--color-success)', fontSize: 14, textAlign: 'center', padding: '16px 0' }}>
                {pwdSuccess}
              </p>
            ) : (
              <form onSubmit={handleChangePassword}>
                <div className="form-group">
                  <label className="form-label">Текущий пароль</label>
                  <input
                    type="password" className="input" value={pwdCurrent}
                    onChange={e => setPwdCurrent(e.target.value)}
                    required placeholder="Текущий пароль" autoComplete="current-password"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Новый пароль</label>
                  <input
                    type="password" className="input" value={pwdNew}
                    onChange={e => setPwdNew(e.target.value)}
                    required minLength={8} placeholder="Минимум 8 символов, буквы и цифры" autoComplete="new-password"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Подтвердите пароль</label>
                  <input
                    type="password" className="input" value={pwdConfirm}
                    onChange={e => setPwdConfirm(e.target.value)}
                    required minLength={8} placeholder="Повторите пароль" autoComplete="new-password"
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

      {showAddEmailModal && (
        <div className="overlay-center" onClick={() => setShowAddEmailModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <span className="modal-title">Добавить email</span>
              <button className="modal-close" aria-label="Закрыть" onClick={() => setShowAddEmailModal(false)}>✕</button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
              Email нужен для оформления платной подписки. Мы отправим на него ссылку для подтверждения.
            </p>
            <form onSubmit={handleAddEmail}>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email" className="input" value={addEmailVal}
                  onChange={e => setAddEmailVal(e.target.value)}
                  required placeholder="ivan@company.com" autoComplete="email" autoFocus
                />
              </div>
              {addEmailErr && (
                <p style={{ fontSize: 13, color: 'var(--color-danger)', marginBottom: 12 }}>{addEmailErr}</p>
              )}
              <button type="submit" className="btn btn-accent" style={{ width: '100%' }} disabled={addEmailLoading}>
                {addEmailLoading ? 'Сохранение...' : 'Добавить и отправить письмо'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showTgModal && (
        <div className="overlay-center" onClick={() => setShowTgModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <span className="modal-title">Привязать Telegram</span>
              <button className="modal-close" aria-label="Закрыть" onClick={() => setShowTgModal(false)}>✕</button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
              Откройте бота в Telegram, отправьте команду /link и введите полученный код. Ваш
              Telegram привяжется к текущему аккаунту — второй профиль не создастся.
            </p>
            <form onSubmit={handleTelegramLink}>
              <div className="form-group">
                <label className="form-label">Код из бота</label>
                <input
                  type="text" className="input" value={tgCode}
                  onChange={e => setTgCode(e.target.value.toUpperCase())}
                  placeholder="Например: K7M2QP" autoFocus
                  style={{ fontFamily: 'monospace', letterSpacing: '0.08em' }}
                />
              </div>
              {tgErr && <p style={{ fontSize: 13, color: 'var(--color-danger)', marginBottom: 12 }}>{tgErr}</p>}
              <button type="submit" className="btn btn-accent" style={{ width: '100%' }} disabled={tgBusy || !tgCode.trim()}>
                {tgBusy ? 'Привязка...' : 'Привязать'}
              </button>
            </form>
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
          top: 0,
          bottom: 0,
          left: 0,
          paddingTop: scrolled ? 46 : 58,
          transition: 'padding-top 0.25s var(--ease-smooth)',
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
            {/* Клик по аватару открывает ОТДЕЛЬНОЕ окно замены фото (загрузка +
                кадрирование/позиция), а не встроенный выбор файла. */}
            <button
              type="button"
              onClick={() => setShowAvatarModal(true)}
              style={{ position: 'relative', cursor: 'pointer', marginBottom: 8, background: 'none', border: 'none', padding: 0 }}
              className="group"
              title="Изменить фото"
              aria-label="Изменить фото профиля"
            >
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
            </button>
            <button
              type="button"
              onClick={() => setShowAvatarModal(true)}
              style={{ background: 'none', border: 'none', color: 'var(--color-accent)', cursor: 'pointer', fontSize: 12, fontWeight: 600, marginBottom: 10 }}
            >
              Изменить фото
            </button>

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
              <SocialLink icon="TG" label="Telegram" value={user?.telegram}
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

                {/* Закрыто сегодня (Задача 2): кликабельный счётчик со списком.
                    Участник — свои закрытые сегодня; тимлид — по всей команде. */}
                <button
                  onClick={openClosedToday}
                  title="Показать закрытые сегодня задачи"
                  style={{
                    marginTop: 6, width: '100%', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', gap: 10, cursor: 'pointer',
                    background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)',
                    border: '1px solid #a7f3d0', borderRadius: 10, padding: '10px 12px',
                    textAlign: 'left',
                  }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: 'radial-gradient(ellipse at 35% 28%, #86efac, #22c55e 55%, #15803d)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(21,128,61,0.35)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polyline points="6,12.5 10,16.5 18,7.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </span>
                    <span>
                      <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#065f46', lineHeight: 1.1 }}>Закрыто сегодня</span>
                      <span style={{ display: 'block', fontSize: 10, color: '#047857', opacity: 0.85 }}>
                        {user?.role === 'team_lead' ? 'по команде' : 'мои задачи'}
                      </span>
                    </span>
                  </span>
                  <span style={{ fontSize: 20, fontWeight: 800, color: '#15803d', lineHeight: 1 }}>
                    {sidebarStats ? (sidebarStats.closed_today ?? 0) : '—'}
                  </span>
                </button>
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
          {/* Баннер подтверждения почты. Не блокирует действия, закрывается.
              Показывается ТОЛЬКО тем, у кого есть email и он не подтверждён —
              пользователи без email (только Telegram) его не видят. */}
          {currentUser?.email && !currentUser?.email_confirmed && !emailBannerHidden && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              background: '#fff8ed', border: '1px solid #fcd9a5', borderRadius: 10,
              padding: '10px 14px', marginBottom: 20,
            }}>
              <span style={{ fontSize: 13, color: '#7c4a03', flex: 1, minWidth: 200 }}>
                Подтвердите почту — это нужно для оформления платной подписки. Мы отправили ссылку на {currentUser.email}.
              </span>
              <button onClick={handleResendConfirmation} disabled={resendLoading}
                style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-accent)', background: 'var(--color-surface)', border: '1px solid var(--blue-200)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                {resendLoading ? 'Отправляем...' : 'Отправить повторно'}
              </button>
              <button onClick={() => setEmailBannerHidden(true)} aria-label="Скрыть"
                style={{ background: 'none', border: 'none', color: '#b7791f', cursor: 'pointer', fontSize: 13 }}>
                Скрыть
              </button>
            </div>
          )}
          {children}
        </main>
      </div>
      <PitAssistant />
      {showKnowledge && <KnowledgeBasePage onClose={() => setShowKnowledge(false)} />}
      {showSupport && <SupportPage currentUser={currentUser} onClose={() => setShowSupport(false)} />}
      <AvatarCropModal
        open={showAvatarModal}
        saving={uploadingAvatar}
        onSave={handleAvatarSave}
        onClose={() => setShowAvatarModal(false)}
      />
      <LegalModal open={showDocs} onClose={() => setShowDocs(false)} />
      <Billing open={showBilling} currentUser={currentUser} initialPlan={billingPlan} onClose={() => setShowBilling(false)} />

      {/* Закрыто сегодня (Задача 2): список закрытых сегодня задач по роли. */}
      {showClosedToday && (
        <div className="overlay-center" onClick={() => setShowClosedToday(false)} style={{ zIndex: 9700 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460, width: '92vw' }}>
            <div className="modal-header" style={{ paddingBottom: 12 }}>
              <div>
                <span className="modal-title">Закрыто сегодня</span>
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>
                  {currentUser?.role === 'team_lead' ? 'Задачи, закрытые сегодня всеми участниками команды' : 'Ваши задачи, закрытые сегодня'}
                </p>
              </div>
              <button className="modal-close" aria-label="Закрыть" onClick={() => setShowClosedToday(false)}>✕</button>
            </div>
            {closedTasks === null ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><div className="spinner" /></div>
            ) : closedTasks.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', padding: '24px 0' }}>
                Сегодня ещё нет закрытых задач
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '60vh', overflowY: 'auto' }}>
                {closedTasks.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 10 }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: 1, background: 'radial-gradient(ellipse at 35% 28%, #86efac, #22c55e 55%, #15803d)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><polyline points="6,12.5 10,16.5 18,7.5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0, lineHeight: 1.35 }}>{t.title}</p>
                      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
                        {t.completed_at ? new Date(t.completed_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''}
                        {t.is_multi && t.progress ? ` · ${t.progress.done}/${t.progress.total} участников` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* First-run product tour — self-gates via localStorage, shown once */}
      <WelcomeTour currentUser={currentUser} />
    </div>
  )
}

/*
 * Пункт меню профиля. Слева — смысловая иконка (не декоративная), затем текст
 * с опциональным пояснением (subtext), справа — опциональный контрол (тумблер).
 * Клик по всей строке вызывает onClick, поэтому тумблер переключается одним
 * нажатием по пункту, без отдельного клика по самому переключателю.
 */
function MenuItemBtn({ children, onClick, danger, icon, subtext, right }) {
  const color = danger ? 'var(--color-danger)' : 'var(--color-text-primary)'
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', padding: '9px 10px',
        fontSize: 14, fontWeight: 500, color,
        background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 10,
        borderRadius: 'var(--radius-sm)', transition: 'background 120ms',
      }}
      onMouseEnter={e => e.currentTarget.style.background = danger ? 'var(--color-danger-bg)' : 'var(--gray-100)'}
      onMouseLeave={e => e.currentTarget.style.background = 'none'}
    >
      {icon && (
        <span style={{ flexShrink: 0, width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: danger ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
          {icon}
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>
        {subtext && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-muted)' }}>{subtext}</span>}
      </span>
      {right && <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{right}</span>}
    </button>
  )
}

function MenuDivider() {
  return <div style={{ height: 1, background: 'var(--color-border)', margin: '5px 8px' }} />
}

// Тумблер состояния: визуально читается как switch, а не как текст «вкл/выкл».
function Toggle({ on }) {
  return (
    <span style={{
      width: 34, height: 20, borderRadius: 999, flexShrink: 0,
      background: on ? 'var(--color-accent)' : 'var(--gray-300)',
      position: 'relative', transition: 'background 160ms',
    }}>
      <span style={{
        position: 'absolute', top: 2, left: on ? 16 : 2,
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 2px rgba(0,0,0,0.3)', transition: 'left 160ms var(--ease-spring, ease)',
      }} />
    </span>
  )
}

// ── Иконки меню (stroke, currentColor) — только по смыслу пункта ──────────────
const svg = (paths) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths}</svg>
)
const IconLock = () => svg(<><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>)
const IconSun = () => svg(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>)
const IconMoon = () => svg(<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />)
const IconHelpHint = () => svg(<><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 0 1 4.5 1.5c0 1.5-2 2-2 3" /><path d="M12 17h.01" /></>)
const IconSwitch = () => svg(<><path d="M7 4v13" /><path d="M4 7l3-3 3 3" /><path d="M17 20V7" /><path d="M20 17l-3 3-3-3" /></>)
const IconLifebuoy = () => svg(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.5" /><path d="M4.9 4.9l4.6 4.6M14.5 14.5l4.6 4.6M19.1 4.9l-4.6 4.6M9.5 14.5l-4.6 4.6" /></>)
const IconDoc = () => svg(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h6" /></>)
const IconBook = () => svg(<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>)
const IconGlobe = () => svg(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z" /></>)
const IconSend = () => svg(<><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" /></>)
const IconLogout = () => svg(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>)

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
    <button type="button" title={(title || label) + ' — появится позже'} onClick={() => toast('Появится позже')}
      style={{ ...base, opacity: 0.55, cursor: 'pointer' }}>
      {inner}
      {!compact && <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-muted)' }}>скоро</span>}
    </button>
  )
}
