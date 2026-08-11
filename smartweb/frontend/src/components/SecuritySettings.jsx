import { useState, useEffect } from 'react'
import {
  twoFaStatus, twoFaSetup, twoFaEnable, twoFaDisable,
  listSessions, revokeSession, revokeOtherSessions,
} from '../api/client'
import { toast } from '../lib/ui'

// Раздел «Безопасность» (Блок 1): опциональная 2FA (TOTP) и управление активными
// сессиями/устройствами. Открывается из меню настроек. Без эмодзи.
export default function SecuritySettings({ open, onClose }) {
  const [status, setStatus] = useState(null)      // { enabled, backup_codes_left }
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(false)

  // Мастер включения 2FA.
  const [setupData, setSetupData] = useState(null) // { otpauth_uri, secret }
  const [enableCode, setEnableCode] = useState('')
  const [backupCodes, setBackupCodes] = useState(null)
  const [disablePwd, setDisablePwd] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = () => {
    setLoading(true)
    Promise.all([
      twoFaStatus().then(r => setStatus(r.data)).catch(() => {}),
      listSessions().then(r => setSessions(r.data.sessions || [])).catch(() => {}),
    ]).finally(() => setLoading(false))
  }

  useEffect(() => { if (open) { setSetupData(null); setBackupCodes(null); setEnableCode(''); setDisablePwd(''); reload() } }, [open])

  if (!open) return null

  const startSetup = async () => {
    setBusy(true)
    try { const r = await twoFaSetup(); setSetupData(r.data) }
    catch (e) { toast(e?.response?.data?.detail || 'Не удалось начать настройку') }
    finally { setBusy(false) }
  }

  const confirmEnable = async () => {
    setBusy(true)
    try {
      const r = await twoFaEnable(enableCode.trim())
      setBackupCodes(r.data.backup_codes || [])
      setSetupData(null); setEnableCode('')
      reload()
    } catch (e) { toast(e?.response?.data?.detail || 'Неверный код') }
    finally { setBusy(false) }
  }

  const doDisable = async () => {
    setBusy(true)
    try { await twoFaDisable(disablePwd); setDisablePwd(''); toast('2FA отключена'); reload() }
    catch (e) { toast(e?.response?.data?.detail || 'Неверный пароль') }
    finally { setBusy(false) }
  }

  const kill = async (id) => { try { await revokeSession(id); reload() } catch {} }
  const killOthers = async () => { try { const r = await revokeOtherSessions(); toast(`Завершено сессий: ${r.data.revoked}`); reload() } catch {} }

  const box = { background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 14, marginBottom: 14 }

  return (
    <div className="overlay-center" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <span className="modal-title">Безопасность</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div style={{ padding: 16 }}>

          {/* 2FA */}
          <div style={box}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Двухфакторная аутентификация (TOTP)</div>
            {!status ? <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Загрузка…</div> : status.enabled ? (
              <>
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                  2FA включена. Резервных кодов осталось: {status.backup_codes_left}.
                </p>
                <input type="password" className="input" placeholder="Пароль для отключения"
                  value={disablePwd} onChange={e => setDisablePwd(e.target.value)} style={{ marginBottom: 8 }} />
                <button className="btn" disabled={busy || !disablePwd} onClick={doDisable}
                  style={{ border: '1px solid var(--color-danger)', color: 'var(--color-danger)', background: 'transparent', borderRadius: 8, padding: '8px 14px' }}>
                  Отключить 2FA
                </button>
              </>
            ) : backupCodes ? (
              <>
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                  2FA включена. Сохраните резервные коды — они показываются один раз. Каждый код одноразовый.
                </p>
                <div style={{ fontFamily: 'monospace', fontSize: 14, columns: 2, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 12 }}>
                  {backupCodes.map(c => <div key={c}>{c}</div>)}
                </div>
                <button className="btn btn-accent" onClick={() => setBackupCodes(null)} style={{ marginTop: 10, borderRadius: 8, padding: '8px 14px' }}>Готово</button>
              </>
            ) : setupData ? (
              <>
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                  Отсканируйте QR в приложении-аутентификаторе (Google Authenticator, Яндекс Ключ) или введите ключ вручную, затем подтвердите кодом.
                </p>
                <div style={{ wordBreak: 'break-all', fontFamily: 'monospace', fontSize: 12, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                  Ключ: {setupData.secret}
                </div>
                <input inputMode="numeric" className="input" placeholder="Код из приложения"
                  value={enableCode} onChange={e => setEnableCode(e.target.value)} style={{ marginBottom: 8 }} />
                <button className="btn btn-accent" disabled={busy || !enableCode} onClick={confirmEnable} style={{ borderRadius: 8, padding: '8px 14px' }}>Включить</button>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                  Дополнительный код при входе по email и паролю. Необязательно.
                </p>
                <button className="btn btn-accent" disabled={busy} onClick={startSetup} style={{ borderRadius: 8, padding: '8px 14px' }}>Включить 2FA</button>
              </>
            )}
          </div>

          {/* Сессии */}
          <div style={box}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>Активные сессии</div>
              {sessions.length > 1 && (
                <button className="btn" onClick={killOthers} style={{ fontSize: 13, border: '1px solid var(--color-border)', background: 'transparent', borderRadius: 8, padding: '5px 10px' }}>
                  Завершить остальные
                </button>
              )}
            </div>
            {loading ? <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Загрузка…</div> : sessions.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Нет активных сессий с отслеживанием.</div>
            ) : sessions.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--color-border)' }}>
                <div>
                  <div style={{ fontSize: 14 }}>{s.device || 'Устройство'} {s.current && <span style={{ fontSize: 12, color: 'var(--color-accent)' }}>(текущая)</span>}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {s.ip || ''} · активна {s.last_active_at ? s.last_active_at.replace('T', ' ').slice(0, 16) : ''}
                  </div>
                </div>
                {!s.current && (
                  <button onClick={() => kill(s.id)} style={{ fontSize: 13, color: 'var(--color-danger)', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }}>
                    Завершить
                  </button>
                )}
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  )
}
