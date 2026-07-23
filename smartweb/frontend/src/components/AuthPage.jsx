import { useState, useEffect } from 'react'
import { setToken } from '../lib/auth'
import LegalModal from './LegalModal'
import TelegramLoginButton from './TelegramLoginButton'
import Spinner from '../lib/Spinner'
import {
  getTelegramConfig, telegramCallback,
  authLogin, authRegister, authForgotPassword,
} from '../api/client'

const ADMIN_PASSWORD = '1on12026'

// Небольшой крутящийся индикатор для кнопок — показываем при долгой загрузке
// (холодный старт бэкенда). Общий компонент Spinner переиспользуется всем
// приложением (веб и админка), чтобы индикатор был единым.
const BtnSpinner = () => <Spinner />

const Logo = () => (
  <div style={{ textAlign: 'center', marginBottom: 32 }}>
    <span className="logo" style={{ fontSize: 26 }}>
      OneOn<span className="accent">One</span>
    </span>
    <p style={{ color: 'var(--color-text-muted)', marginTop: 8, fontSize: 14 }}>
      Эффективные 1-on-1 встречи с командой
    </p>
  </div>
)

export default function AuthPage({ onAdminLogin, onTelegramAuth, onAuthSuccess }) {
  const [mode, setMode] = useState('login') // login | register | forgot | forgot_sent | admin
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showConsent, setShowConsent] = useState(false)
  const [error, setError] = useState('')
  const [adminPwd, setAdminPwd] = useState('')
  const [tgConfig, setTgConfig] = useState(null)  // { bot_username, enabled }
  const [tgLoading, setTgLoading] = useState(false)

  useEffect(() => {
    getTelegramConfig().then(r => setTgConfig(r.data)).catch(() => setTgConfig(null))
  }, [])

  // Колбэк официального виджета: отправляем подписанные данные на бэкенд для
  // проверки hash и входа/регистрации по telegram_id (Этапы 3-5).
  const handleTelegramWidget = async (tgUser) => {
    setError(''); setTgLoading(true)
    try {
      const { data } = await telegramCallback(tgUser)
      onTelegramAuth?.(data)  // { status, user }
    } catch (err) {
      setError(err?.response?.data?.detail || 'Не удалось войти через Telegram')
    } finally { setTgLoading(false) }
  }

  // Пароль: не короче 8 символов, буквы + цифры (совпадает с проверкой бэкенда).
  const passwordProblem = (pw) => {
    if ((pw || '').length < 8) return 'Пароль должен быть не короче 8 символов'
    if (!/[A-Za-zА-Яа-я]/.test(pw) || !/\d/.test(pw)) return 'Пароль должен содержать буквы и цифры'
    return ''
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await authLogin({ email, password })
      setToken(data.token)
      onAuthSuccess?.(data.user)  // App поставит пользователя и решит про онбординг
    } catch (err) {
      setError(translateError(err?.response?.data?.detail || 'Не удалось войти'))
    } finally { setLoading(false) }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) { setError('Пароли не совпадают'); return }
    const pw = passwordProblem(password)
    if (pw) { setError(pw); return }
    setLoading(true)
    try {
      // Регистрация без выбора роли — роль/профиль выбираются в онбординге.
      // Пользователь сразу авторизуется, доступ не блокируется; письмо с
      // подтверждением уходит, баннер о подтверждении покажется внутри продукта.
      const { data } = await authRegister({ name: email.split('@')[0], email, password })
      setToken(data.token)
      onAuthSuccess?.(data.user)
    } catch (err) {
      setError(translateError(err?.response?.data?.detail || 'Не удалось зарегистрироваться'))
    } finally { setLoading(false) }
  }

  const handleForgot = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await authForgotPassword(email)
      setMode('forgot_sent')  // всегда успех — не раскрываем наличие аккаунта
    } catch {
      setMode('forgot_sent')
    } finally { setLoading(false) }
  }

  const handleAdminLogin = (e) => {
    e.preventDefault()
    if (adminPwd === ADMIN_PASSWORD) {
      onAdminLogin?.()
    } else {
      setError('Неверный пароль администратора')
    }
  }

  // Бэкенд уже отдаёт понятные русские сообщения в detail — показываем как есть.
  const translateError = (msg) => (typeof msg === 'string' ? msg : 'Произошла ошибка')

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--color-bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, fontFamily: 'var(--font-sans)',
    }}>
      <div style={{ width: '100%', maxWidth: 420 }} className="anim-fade">
        <Logo />

        {/* Письмо для сброса пароля отправлено */}
        {mode === 'forgot_sent' && (
          <div className="card anim-slide" style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--blue-50)', border: '1px solid var(--blue-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}><svg width="26" height="26" viewBox="0 0 26 26" fill="none"><rect x="2" y="6" width="22" height="15" rx="2" stroke="var(--color-accent)" strokeWidth="1.5"/><path d="M2 9l11 7 11-7" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinejoin="round"/></svg></div>
            <h2 style={{ fontWeight: 600, fontSize: 20, color: 'var(--color-text-primary)', marginBottom: 10 }}>
              Проверьте почту
            </h2>
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              Если для этого адреса есть аккаунт с паролем, мы отправили ссылку для смены пароля на
            </p>
            <p style={{ fontWeight: 600, color: 'var(--color-accent)', fontSize: 15, marginBottom: 20 }}>
              {email}
            </p>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 24 }}>
              Ссылка действует 1 час.
            </p>
            <button onClick={() => { setMode('login'); setError('') }} className="btn btn-accent" style={{ width: '100%' }}>
              Вернуться ко входу
            </button>
          </div>
        )}

        {/* Забыли пароль — ввод email */}
        {mode === 'forgot' && (
          <div className="card anim-slide" style={{ padding: 28 }}>
            <h2 style={{ fontWeight: 600, fontSize: 18, color: 'var(--color-text-primary)', marginBottom: 6 }}>
              Сброс пароля
            </h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 18 }}>
              Укажите email — пришлём ссылку для смены пароля.
            </p>
            <form onSubmit={handleForgot}>
              <div className="form-group">
                <label className="form-label" htmlFor="forgot-email">Email</label>
                <input
                  id="forgot-email" type="email" value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="ivan@company.com" className="input" required autoComplete="email" autoFocus
                />
              </div>
              {error && (
                <div style={{ background: 'var(--color-danger-bg)', border: '1px solid #FCA5A5', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)', padding: '11px 14px', fontSize: 14, marginBottom: 14 }}>{error}</div>
              )}
              <button type="submit" disabled={loading} className="btn btn-accent" style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                {loading ? (<><BtnSpinner /> Отправляем...</>) : 'Отправить ссылку'}
              </button>
            </form>
            <button
              onClick={() => { setMode('login'); setError('') }}
              style={{ width: '100%', marginTop: 12, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 13 }}
            >
              Назад ко входу
            </button>
          </div>
        )}

        {/* Admin login */}
        {mode === 'admin' && (
          <div className="card anim-slide" style={{ padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <span style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--color-bg)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="7" width="10" height="8" rx="2" stroke="var(--color-accent)" strokeWidth="1.4"/><path d="M5 7V5a3 3 0 016 0v2" stroke="var(--color-accent)" strokeWidth="1.4" strokeLinecap="round"/></svg></span>
              <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--color-text-primary)' }}>Вход для администратора</p>
            </div>
            <form onSubmit={handleAdminLogin}>
              <div className="form-group">
                <label className="form-label">Пароль администратора</label>
                <input
                  type="password"
                  value={adminPwd}
                  onChange={e => { setAdminPwd(e.target.value); setError('') }}
                  placeholder="••••••••••"
                  className="input"
                  autoFocus
                  required
                />
              </div>
              {error && (
                <div style={{
                  background: 'var(--color-danger-bg)', border: '1px solid #FCA5A5',
                  color: 'var(--color-danger)', borderRadius: 'var(--radius-md)',
                  padding: '10px 14px', fontSize: 13, marginBottom: 14,
                }}>
                  {error}
                </div>
              )}
              <button type="submit" className="btn btn-accent" style={{ width: '100%' }}>
                Войти как администратор
              </button>
            </form>
            <button
              onClick={() => { setMode('login'); setError(''); setAdminPwd('') }}
              style={{ width: '100%', marginTop: 12, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 13 }}
            >
              ← Назад к обычному входу
            </button>
          </div>
        )}

        {/* Auth form */}
        {(mode === 'login' || mode === 'register') && (
          <div className="card anim-slide" style={{ padding: 28 }}>
            {/* Tabs */}
            <div style={{
              display: 'flex', background: 'var(--color-surface-2)',
              borderRadius: 'var(--radius-md)', padding: 4, marginBottom: 24,
            }}>
              {[
                { key: 'login', label: 'Войти' },
                { key: 'register', label: 'Зарегистрироваться' },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => { setMode(t.key); setError('') }}
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                    border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500,
                    fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
                    background: mode === t.key ? 'var(--color-surface)' : 'transparent',
                    color: mode === t.key ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                    boxShadow: mode === t.key ? 'var(--shadow-sm)' : 'none',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <form onSubmit={mode === 'login' ? handleLogin : handleRegister}>
              {/* Labels tied to inputs (htmlFor/id) — required for screen readers
                  and for browser password managers to autofill correctly. */}
              <div className="form-group">
                <label className="form-label" htmlFor="auth-email">Email</label>
                <input
                  id="auth-email"
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="ivan@company.com" className="input" required autoComplete="email"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="auth-password">Пароль</label>
                <input
                  id="auth-password"
                  type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" className="input" required autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </div>

              {mode === 'register' && (
                <div className="form-group">
                  <label className="form-label" htmlFor="auth-confirm">Повторите пароль</label>
                  <input
                    id="auth-confirm"
                    type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="••••••••" className="input" required autoComplete="new-password"
                  />
                </div>
              )}

              {error && (
                <div style={{
                  background: 'var(--color-danger-bg)', border: '1px solid #FCA5A5',
                  color: 'var(--color-danger)', borderRadius: 'var(--radius-md)',
                  padding: '11px 14px', fontSize: 14, marginBottom: 14,
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit" disabled={loading} className="btn btn-accent"
                style={{ width: '100%', padding: '13px 24px', fontSize: 15, marginTop: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
              >
                {loading
                  ? (<><BtnSpinner /> {mode === 'login' ? 'Входим...' : 'Регистрируемся...'}</>)
                  : (mode === 'login' ? 'Войти →' : 'Зарегистрироваться →')}
              </button>

              {mode === 'login' && (
                <div style={{ textAlign: 'center', marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setError('') }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--color-text-muted)' }}
                  >
                    Забыли пароль?
                  </button>
                </div>
              )}

              <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-text-muted)', marginTop: 14, lineHeight: 1.5 }}>
                {mode === 'register' ? 'Регистрируясь' : 'Продолжая'}, вы даёте{' '}
                <button
                  type="button"
                  onClick={() => setShowConsent(true)}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-accent)', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}
                >
                  согласие на обработку персональных данных
                </button>.
              </p>
            </form>

            {/* Вход через Telegram — дополняет email/пароль, не заменяет (Этап 3) */}
            {tgConfig?.enabled && tgConfig.bot_username && (
              <div style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 16px' }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>или</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
                </div>
                <TelegramLoginButton botUsername={tgConfig.bot_username} onAuth={handleTelegramWidget} />
                {tgLoading && (
                  <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)', marginTop: 10 }}>
                    Входим через Telegram...
                  </p>
                )}
              </div>
            )}

            {/* Admin link */}
            <div style={{ textAlign: 'center', marginTop: 18 }}>
              <button
                onClick={() => { setMode('admin'); setError('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--color-text-muted)' }}
              >
                Вход для администратора
              </button>
            </div>
          </div>
        )}
      </div>
      <LegalModal open={showConsent} initialKey="privacy" onClose={() => setShowConsent(false)} />
    </div>
  )
}
