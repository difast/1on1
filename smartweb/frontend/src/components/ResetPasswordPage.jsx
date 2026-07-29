import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { authResetPassword } from '../api/client'
import { setToken } from '../lib/auth'

// Страница по ссылке из письма: /reset-password?token=...
// Форма нового пароля. После успеха токен инвалидируется на бэкенде, а нас
// сразу авторизуют выданным JWT и ведут в приложение.
export default function ResetPasswordPage() {
  const { t } = useTranslation()
  const token = new URLSearchParams(window.location.search).get('token') || ''
  const [pwd, setPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const problem = (p) => {
    if ((p || '').length < 8) return t('validation.passwordShort')
    if (!/[A-Za-zА-Яа-я]/.test(p) || !/\d/.test(p)) return t('validation.passwordWeak')
    return ''
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (pwd !== confirm) { setError(t('ui.paroli_ne_sovpadayut')); return }
    const pr = problem(pwd)
    if (pr) { setError(pr); return }
    if (!token) { setError(t('ui.net_tokena_v_ssylke')); return }
    setLoading(true)
    try {
      const { data } = await authResetPassword(token, pwd)
      setToken(data.token)
      setDone(true)
      setTimeout(() => { window.location.href = '/' }, 1200)
    } catch (err) {
      setError(err?.response?.data?.detail || t('validation.linkExpired'))
    } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'var(--font-sans)' }}>
      <div className="card" style={{ maxWidth: 420, width: '100%', padding: 32 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <span className="logo" style={{ fontSize: 24 }}>OneOn<span className="accent">One</span></span>
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 16, textAlign: 'center' }}>{t('ui.novyy_parol')}</h2>
        {done ? (
          <p style={{ textAlign: 'center', color: 'var(--color-success)', fontSize: 14 }}>{t('ui.parol_izmenen_vhodim')}</p>
        ) : (
          <form onSubmit={submit}>
            <div className="form-group">
              <label className="form-label" htmlFor="rp-new">{t('ui.novyy_parol')}</label>
              <input id="rp-new" type="password" value={pwd} onChange={e => setPwd(e.target.value)}
                placeholder="••••••••" className="input" required autoComplete="new-password" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="rp-confirm">{t('ui.povtorite_parol')}</label>
              <input id="rp-confirm" type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••" className="input" required autoComplete="new-password" />
            </div>
            {error && (
              <div style={{ background: 'var(--color-danger-bg)', border: '1px solid #FCA5A5', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)', padding: '11px 14px', fontSize: 14, marginBottom: 14 }}>{error}</div>
            )}
            <button type="submit" disabled={loading} className="btn btn-accent" style={{ width: '100%' }}>
              {loading ? t('common.saving') : t('ui.sohranit_parol')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
