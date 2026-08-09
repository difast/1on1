import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { setToken } from '../lib/auth'
import LegalModal from './LegalModal'
import TelegramLoginButton from './TelegramLoginButton'
import YandexLoginButton from './YandexLoginButton'
import VkLoginButton from './VkLoginButton'
import Spinner from '../lib/Spinner'
import ConfirmEmailModal from './ConfirmEmailModal'
import {
  getTelegramConfig, telegramCallback, getYandexAuthConfig,
  authLogin, authRegister, authForgotPassword, adminLogin, authResendConfirmation,
} from '../api/client'

// Пароль администратора в клиенте не хранится: проверку делает только бэкенд
// (POST /auth/admin-login по переменной окружения ADMIN_PASSWORD). Любая
// константа здесь попала бы в собранный бандл и была бы видна в браузере.

// Небольшой крутящийся индикатор для кнопок — показываем при долгой загрузке
// (холодный старт бэкенда). Общий компонент Spinner переиспользуется всем
// приложением (веб и админка), чтобы индикатор был единым.
const BtnSpinner = () => <Spinner />

const Logo = () => {
  const { t } = useTranslation()
  return (
  <div style={{ textAlign: 'center', marginBottom: 32 }}>
    <span className="logo" style={{ fontSize: 26 }}>
      OneOn<span className="accent">One</span>
    </span>
    <p style={{ color: 'var(--color-text-muted)', marginTop: 8, fontSize: 14 }}>
      {t('auth.tagline')}
    </p>
  </div>
  )
}

export default function AuthPage({ onAdminLogin, onTelegramAuth, onAuthSuccess }) {
  const { t } = useTranslation()
  const [mode, setMode] = useState('login') // login | register | forgot | forgot_sent | admin
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showConsent, setShowConsent] = useState(false)
  const [error, setError] = useState('')
  const [adminPwd, setAdminPwd] = useState('')
  const [tgConfig, setTgConfig] = useState(null)  // { bot_username, bot_id, enabled }
  const [tgLoading, setTgLoading] = useState(false)
  // Подсказка «Скоро будет доступно» под рядом соц-иконок — показывается при
  // клике по заглушке VK ID (Задача 3). Живёт отдельно от error, чтобы не
  // конфликтовать с ошибками формы.
  const [socialHint, setSocialHint] = useState('')
  // Вход через Yandex ID — дополнительный способ рядом с email/паролем и
  // Telegram. Кнопка показывается, только если способ настроен на бэкенде.
  const [yandexEnabled, setYandexEnabled] = useState(false)
  // Модальное окно подтверждения почты после успешной регистрации (Задача 2).
  // Пока оно открыто, пользователь НЕ в кабинете: токен не выдан.
  const [confirmEmail, setConfirmEmail] = useState('')
  // Признак блокировки входа из-за неподтверждённой почты — показываем
  // сообщение с кнопкой повторной отправки письма (Задача 2.4).
  const [needConfirm, setNeedConfirm] = useState(false)
  const [resendState, setResendState] = useState('')  // '' | 'sending' | 'sent'

  useEffect(() => {
    getTelegramConfig().then(r => setTgConfig(r.data)).catch(() => setTgConfig(null))
    getYandexAuthConfig().then(r => setYandexEnabled(!!r.data?.enabled)).catch(() => setYandexEnabled(false))
  }, [])

  // Колбэк официального виджета: отправляем подписанные данные на бэкенд для
  // проверки hash и входа/регистрации по telegram_id (Этапы 3-5).
  const handleTelegramWidget = async (tgUser) => {
    setError(''); setTgLoading(true)
    try {
      const { data } = await telegramCallback(tgUser)
      onTelegramAuth?.(data)  // { status, user }
    } catch (err) {
      setError(err?.response?.data?.detail || t('auth.telegramFailed'))
    } finally { setTgLoading(false) }
  }

  // Пароль: не короче 8 символов, буквы + цифры (совпадает с проверкой бэкенда).
  const passwordProblem = (pw) => {
    if ((pw || '').length < 8) return t('validation.passwordShort')
    if (!/[A-Za-zА-Яа-я]/.test(pw) || !/\d/.test(pw)) return t('validation.passwordWeak')
    return ''
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setError(''); setNeedConfirm(false); setResendState('')
    setLoading(true)
    try {
      const { data } = await authLogin({ email, password })
      setToken(data.token)
      onAuthSuccess?.(data.user)  // App поставит пользователя и решит про онбординг
    } catch (err) {
      const detail = err?.response?.data?.detail
      // Вход заблокирован до подтверждения почты (Задача 2.4): бэкенд отдаёт
      // структурированный detail с code='email_unconfirmed'. Показываем понятное
      // сообщение и кнопку повторной отправки письма, а не текст ошибки.
      if (err?.response?.status === 403 && detail && typeof detail === 'object' && detail.code === 'email_unconfirmed') {
        setNeedConfirm(true)
        setError(detail.message || t('validation.emailUnconfirmed'))
      } else {
        setError(translateError((detail && typeof detail === 'string' ? detail : null) || t('validation.loginFailed')))
      }
    } finally { setLoading(false) }
  }

  const handleResend = async () => {
    if (resendState === 'sending') return
    setResendState('sending')
    try {
      await authResendConfirmation({ email })
      setResendState('sent')
    } catch { setResendState('') }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) { setError(t('validation.passwordMismatch')); return }
    const pw = passwordProblem(password)
    if (pw) { setError(pw); return }
    setLoading(true)
    try {
      // Регистрация без выбора роли — роль/профиль выбираются в онбординге.
      // Токен НЕ приходит: доступ в кабинет закрыт до подтверждения почты.
      // Вместо входа показываем модальное окно подтверждения (Задача 2.1).
      await authRegister({ name: email.split('@')[0], email, password })
      setConfirmEmail(email)
    } catch (err) {
      setError(translateError(err?.response?.data?.detail || t('errors.generic')))
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

  const handleAdminLogin = async (e) => {
    e.preventDefault()
    // Получаем серверный админ-JWT: с ним запросы админки проходят гейт
    // AUTH_ENFORCE и require_admin. Локального отката на сравнение с зашитым
    // паролем больше нет — пароль знает только сервер; если эндпоинт недоступен,
    // показываем ошибку, а не пускаем в админку по клиентской проверке.
    try {
      const { data } = await adminLogin(adminPwd)
      if (data?.token) setToken(data.token)
      onAdminLogin?.()
      return
    } catch (err) {
      const detail = err?.response?.data?.detail
      if (err?.response?.status === 503 && typeof detail === 'string') { setError(detail); return }
      setError(t('auth.adminWrongPassword'))
    }
  }

  // Бэкенд уже отдаёт понятные русские сообщения в detail — показываем как есть.
  const translateError = (msg) => (typeof msg === 'string' ? msg : t('errors.generic'))

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
              {t('auth.checkEmailTitle')}
            </h2>
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {t('auth.checkEmailText')}
            </p>
            <p style={{ fontWeight: 600, color: 'var(--color-accent)', fontSize: 15, marginBottom: 20 }}>
              {email}
            </p>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 24 }}>
              {t('auth.checkEmailValidity')}
            </p>
            <button onClick={() => { setMode('login'); setError('') }} className="btn btn-accent" style={{ width: '100%' }}>
              {t('auth.backToLogin')}
            </button>
          </div>
        )}

        {/* Забыли пароль — ввод email */}
        {mode === 'forgot' && (
          <div className="card anim-slide" style={{ padding: 28 }}>
            <h2 style={{ fontWeight: 600, fontSize: 18, color: 'var(--color-text-primary)', marginBottom: 6 }}>
              {t('auth.resetTitle')}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 18 }}>
              {t('auth.resetHint')}
            </p>
            <form onSubmit={handleForgot}>
              <div className="form-group">
                <label className="form-label" htmlFor="forgot-email">{t('auth.email')}</label>
                <input
                  id="forgot-email" type="email" value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder={t('auth.emailPlaceholder')} className="input" required autoComplete="email" autoFocus
                />
              </div>
              {error && (
                <div style={{ background: 'var(--color-danger-bg)', border: '1px solid #FCA5A5', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)', padding: '11px 14px', fontSize: 14, marginBottom: 14 }}>{error}</div>
              )}
              <button type="submit" disabled={loading} className="btn btn-accent" style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                {loading ? (<><BtnSpinner /> {t('common.sending')}</>) : t('auth.resetSubmit')}
              </button>
            </form>
            <button
              onClick={() => { setMode('login'); setError('') }}
              style={{ width: '100%', marginTop: 12, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 13 }}
            >
              {t('auth.resetBack')}
            </button>
          </div>
        )}

        {/* Admin login */}
        {mode === 'admin' && (
          <div className="card anim-slide" style={{ padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <span style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--color-bg)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="7" width="10" height="8" rx="2" stroke="var(--color-accent)" strokeWidth="1.4"/><path d="M5 7V5a3 3 0 016 0v2" stroke="var(--color-accent)" strokeWidth="1.4" strokeLinecap="round"/></svg></span>
              <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--color-text-primary)' }}>{t('auth.adminLogin')}</p>
            </div>
            <form onSubmit={handleAdminLogin}>
              <div className="form-group">
                <label className="form-label">{t('auth.adminPassword')}</label>
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
                {t('auth.adminSubmit')}
              </button>
            </form>
            <button
              onClick={() => { setMode('login'); setError(''); setAdminPwd('') }}
              style={{ width: '100%', marginTop: 12, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 13 }}
            >
              {t('auth.adminBack')}
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
                { key: 'login', label: t('auth.tabLogin') },
                { key: 'register', label: t('auth.tabRegister') },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => { setMode(t.key); setError(''); setSocialHint('') }}
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
                <label className="form-label" htmlFor="auth-email">{t('auth.email')}</label>
                <input
                  id="auth-email"
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="ivan@company.com" className="input" required autoComplete="email"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="auth-password">{t('auth.password')}</label>
                <input
                  id="auth-password"
                  type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" className="input" required autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </div>

              {mode === 'register' && (
                <div className="form-group">
                  <label className="form-label" htmlFor="auth-confirm">{t('auth.repeatPassword')}</label>
                  <input
                    id="auth-confirm"
                    type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="••••••••" className="input" required autoComplete="new-password"
                  />
                </div>
              )}

              {error && (
                <div style={{
                  background: needConfirm ? '#fff8ed' : 'var(--color-danger-bg)',
                  border: `1px solid ${needConfirm ? '#fcd9a5' : '#FCA5A5'}`,
                  color: needConfirm ? '#7c4a03' : 'var(--color-danger)',
                  borderRadius: 'var(--radius-md)', padding: '11px 14px', fontSize: 14, marginBottom: 14,
                }}>
                  {error}
                  {needConfirm && (
                    <div style={{ marginTop: 8 }}>
                      {resendState === 'sent' ? (
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{t('auth.resendSent')}</span>
                      ) : (
                        <button type="button" onClick={handleResend} disabled={resendState === 'sending'}
                          style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-accent)', background: 'var(--color-surface)', border: '1px solid var(--blue-200)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                          {resendState === 'sending' ? t('common.sending') : t('auth.resendEmail')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Высота задана явно: кнопка входа, кнопка Яндекс ID и виджет
                  Telegram должны быть одного размера, а не вразнобой. */}
              <button
                type="submit" disabled={loading} className="btn btn-accent"
                style={{ width: '100%', minHeight: 44, padding: '0 24px', fontSize: 15, marginTop: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
              >
                {loading
                  ? (<><BtnSpinner /> {mode === 'login' ? t('auth.loggingIn') : t('auth.registering')}</>)
                  : (mode === 'login' ? `${t('auth.submitLogin')} →` : `${t('auth.submitRegister')} →`)}
              </button>

            </form>

            {/* Соц-вход компактным рядом иконок. Порядок способов сохранён:
                Яндекс ID, Telegram, VK ID. Все дополняют email/пароль, не
                заменяют его. Яндекс и Telegram показываются, если настроены на
                бэкенде; VK ID пока заглушка «скоро» (Задача 3) и присутствует
                всегда как анонс будущего способа. Разделитель «Войти через»
                отделяет ряд от формы. */}
            <div style={{ marginTop: 16 }}>
              <div className="social-divider"><span>{t('auth.loginWith')}</span></div>
              <div className="social-row">
                {yandexEnabled && (
                  <YandexLoginButton compact onError={setError} />
                )}
                {tgConfig?.enabled && tgConfig.bot_username && (
                  <TelegramLoginButton
                    botId={tgConfig.bot_id}
                    botUsername={tgConfig.bot_username}
                    onAuth={handleTelegramWidget}
                    onError={setError}
                  />
                )}
                <VkLoginButton onSoon={setSocialHint} />
              </div>
              <div className="social-hint" aria-live="polite">
                {tgLoading ? t('auth.telegramLoggingIn') : socialHint}
              </div>
            </div>

            {/* Ниже кнопок входа: восстановление пароля, согласие, админ-вход */}
            {mode === 'login' && (
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setError('') }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--color-text-muted)' }}
                >
                  {t('auth.forgotPassword')}
                </button>
              </div>
            )}

            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-text-muted)', marginTop: 14, lineHeight: 1.5 }}>
              {mode === 'register' ? t('auth.consentPrefixRegister') : t('auth.consentPrefixLogin')}{' '}
              <button
                type="button"
                onClick={() => setShowConsent(true)}
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-accent)', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}
              >
                {t('auth.consentLink')}
              </button>.
            </p>

            {/* Вход для администратора — служебный, не равнозначен обычному входу.
                Визуально обособлен: увеличенный отступ и тонкий разделитель
                сверху, мельче кегль и приглушённее цвет, чтобы не смотрелся как
                ещё один вариант входа для обычного пользователя (Задача 5). */}
            <div style={{ textAlign: 'center', marginTop: 26, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
              <button
                onClick={() => { setMode('admin'); setError('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--color-text-muted)', opacity: 0.7, letterSpacing: '0.02em' }}
              >
                {t('auth.adminLogin')}
              </button>
            </div>
          </div>
        )}
      </div>
      <LegalModal open={showConsent} initialKey="privacy" onClose={() => setShowConsent(false)} />

      {/* Модальное окно подтверждения почты после регистрации (Задача 2).
          "Войти" переключает на вкладку входа (вход остаётся заблокированным до
          подтверждения). Кнопка почтового сервиса открывает нужный веб-клиент. */}
      <ConfirmEmailModal
        open={!!confirmEmail}
        email={confirmEmail}
        onGoLogin={() => {
          setConfirmEmail('')
          setMode('login')
          setPassword(''); setConfirmPassword('')
          setNeedConfirm(true)
          setError(t('ui.podtverdite_pochtu_chtoby_voyti_my_otpravili') + confirmEmail + '.')
        }}
        onClose={() => setConfirmEmail('')}
      />
    </div>
  )
}
