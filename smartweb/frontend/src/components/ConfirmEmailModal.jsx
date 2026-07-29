import useEscapeKey from '../lib/useEscapeKey'
import { useTranslation } from 'react-i18next'
import { mailProviderFor } from '../lib/mailProviders'

/*
 * Модальное окно подтверждения почты сразу после регистрации (Задача 2).
 *
 * Показывается вместо входа в кабинет: доступ закрыт до подтверждения адреса
 * (токен на регистрации не выдаётся, вход блокируется бэкендом). Содержит
 * крупный брендовый акцент OneOnOne, деловой текст, сам адрес и две кнопки:
 * слева «Войти» (ведёт на экран входа, где вход всё ещё заблокирован до
 * подтверждения), справа — переход в почтовый сервис по домену адреса.
 */
export default function ConfirmEmailModal({ open, email, onGoLogin, onClose }) {
  const { t } = useTranslation()
  useEscapeKey(onClose, open)
  if (!open) return null

  const provider = mailProviderFor(email)

  const openMail = () => {
    if (provider.url) window.open(provider.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9600,
        background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="card anim-pop"
        style={{ width: '100%', maxWidth: 440, padding: '32px 28px', textAlign: 'center' }}
        role="dialog"
        aria-modal="true"
        aria-label={t('ui.podtverzhdenie_pochty')}
      >
        {/* Брендовый акцент окна — крупная надпись заглавными буквами */}
        <div style={{
          fontSize: 30, fontWeight: 800, letterSpacing: '0.04em',
          color: 'var(--color-text-primary)', marginBottom: 20, textTransform: 'uppercase',
        }}>
          ONEON<span style={{ color: 'var(--color-accent)' }}>ONE</span>
        </div>

        <div style={{
          width: 60, height: 60, borderRadius: 16, background: 'var(--blue-50)',
          border: '1px solid var(--blue-200)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', margin: '0 auto 18px',
        }}>
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
            <rect x="2" y="6" width="22" height="15" rx="2" stroke="var(--color-accent)" strokeWidth="1.5" />
            <path d="M2 9l11 7 11-7" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 10 }}>{t('ui.podtverdite_pochtu')}</h2>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 6 }}>{t('ui.registraciya_zavershena_my_otpravili_pismo_so')}</p>
        <p style={{ fontWeight: 700, color: 'var(--color-accent)', fontSize: 15, marginBottom: 10, wordBreak: 'break-all' }}>
          {email}
        </p>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: 24 }}>{t('auth.confirmHint')}</p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
          <button
            className="btn btn-secondary"
            onClick={onGoLogin}
            style={{ flex: '0 0 auto', minWidth: 110 }}
          >{t('ui.voyti')}</button>
          <button
            className="btn btn-accent"
            onClick={openMail}
            disabled={!provider.url}
            title={provider.url ? t(provider.labelKey) : t('ui.otkroyte_vash_pochtovyy_yaschik')}
            style={{ flex: 1 }}
          >
            {t(provider.labelKey)}
          </button>
        </div>
      </div>
    </div>
  )
}
