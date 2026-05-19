import { useState } from 'react'
import { supabase } from '../lib/supabase'

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

export default function AuthPage() {
  const [mode, setMode] = useState('login') // 'login' | 'register' | 'check_email'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
            <div style={{ fontSize: 48, marginBottom: 16 }}>📬</div>
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

        {/* Auth form */}
        {mode !== 'check_email' && (
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
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
