import { useState } from 'react'
import { supabase } from '../lib/supabase'
import LegalModal from './LegalModal'

const ADMIN_PASSWORD = '1on12026'

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

export default function AuthPage({ onAdminLogin }) {
  const [mode, setMode] = useState('login') // 'login' | 'register' | 'check_email' | 'admin'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showConsent, setShowConsent] = useState(false)
  const [error, setError] = useState('')
  const [adminPwd, setAdminPwd] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(translateError(error.message))
    setLoading(false)
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) { setError('Пароли не совпадают'); return }
    if (password.length < 6) { setError('Пароль минимум 6 символов'); return }
    setLoading(true)
    const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
    if (error) setError(translateError(error.message))
    else setMode('check_email')
    setLoading(false)
  }

  const handleAdminLogin = (e) => {
    e.preventDefault()
    if (adminPwd === ADMIN_PASSWORD) {
      onAdminLogin?.()
    } else {
      setError('Неверный пароль администратора')
    }
  }

  const translateError = (msg) => {
    if (msg.includes('Invalid login credentials')) return 'Неверный email или пароль'
    if (msg.includes('Email not confirmed')) return 'Сначала подтвердите email — проверьте почту'
    if (msg.includes('already registered')) return 'Этот email уже зарегистрирован'
    if (msg.includes('rate limit')) return 'Слишком много попыток, подождите немного'
    return msg
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--color-bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, fontFamily: 'var(--font-sans)',
    }}>
      <div style={{ width: '100%', maxWidth: 420 }} className="anim-fade">
        <Logo />

        {/* Check email screen */}
        {mode === 'check_email' && (
          <div className="card anim-slide" style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--blue-50)', border: '1px solid var(--blue-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}><svg width="26" height="26" viewBox="0 0 26 26" fill="none"><rect x="2" y="6" width="22" height="15" rx="2" stroke="var(--color-accent)" strokeWidth="1.5"/><path d="M2 9l11 7 11-7" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinejoin="round"/></svg></div>
            <h2 style={{ fontWeight: 600, fontSize: 20, color: 'var(--color-text-primary)', marginBottom: 10 }}>
              Проверьте почту
            </h2>
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              Мы отправили письмо на
            </p>
            <p style={{ fontWeight: 600, color: 'var(--color-accent)', fontSize: 15, marginBottom: 20 }}>
              {email}
            </p>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 24 }}>
              Перейдите по ссылке в письме, затем войдите в аккаунт.
            </p>
            <button onClick={() => setMode('login')} className="btn btn-accent" style={{ width: '100%' }}>
              Войти
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
        {mode !== 'check_email' && mode !== 'admin' && (
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
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="ivan@company.com" className="input" required autoComplete="email"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Пароль</label>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" className="input" required autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </div>

              {mode === 'register' && (
                <div className="form-group">
                  <label className="form-label">Повторите пароль</label>
                  <input
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
                style={{ width: '100%', padding: '13px 24px', fontSize: 15, marginTop: 4 }}
              >
                {loading
                  ? (mode === 'login' ? 'Входим...' : 'Регистрируемся...')
                  : (mode === 'login' ? 'Войти →' : 'Зарегистрироваться →')}
              </button>

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
