import { useState, useEffect, useCallback } from 'react'
import {
  getIntegrationsStatus, getIntegrationAuthUrl, disconnectIntegration,
  createWebhook, deleteWebhook, testWebhook,
} from '../api/client'
import { confirmDialog } from '../lib/ui'

/*
 * Вкладка «Интеграции»: подключение календарей (Google, Яндекс) с двусторонней
 * синхронизацией встреч, управление исходящими Webhook и честный список
 * «Скоро». Токены хранит бэкенд в шифрованном виде — клиент их не видит.
 */

const CAL_META = {
  google: { name: 'Google Calendar', desc: 'Встречи 1-на-1 автоматически синхронизируются с вашим Google-календарём.' },
  yandex: { name: 'Яндекс Календарь', desc: 'Встречи 1-на-1 автоматически синхронизируются с вашим Яндекс-календарём.' },
}

const STATUS_LABEL = {
  connected: 'Подключено',
  reauth_required: 'Требуется переподключение',
  not_connected: 'Не подключено',
}

function CalendarCard({ item, userId, onChange }) {
  const [busy, setBusy] = useState(false)
  const meta = CAL_META[item.provider] || { name: item.provider, desc: '' }

  const connect = async () => {
    setBusy(true)
    try {
      const { data } = await getIntegrationAuthUrl(item.provider, userId)
      if (data?.url) window.location.href = data.url
    } catch (e) {
      onChange?.(e?.response?.data?.detail?.message || 'Интеграция ещё не настроена администратором.')
      setBusy(false)
    }
  }

  const disconnect = async () => {
    if (!(await confirmDialog({ title: `Отключить ${meta.name}?`, message: 'Синхронизация встреч с этим календарём прекратится. Уже созданные события останутся.', confirmText: 'Отключить', danger: true }))) return
    setBusy(true)
    try { await disconnectIntegration(item.provider, userId); onChange?.() }
    finally { setBusy(false) }
  }

  const reauth = item.status === 'reauth_required'
  const badgeColor = item.connected ? 'var(--color-success, #16a34a)' : reauth ? 'var(--color-danger)' : 'var(--color-text-muted)'

  // Карточки календарей одинаковой высоты, кнопка действия прижата к низу
  // (marginTop:auto) — чтобы Google и Яндекс были ровно выровнены в ряду.
  return (
    <div className="card" style={{ padding: 18, height: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)' }}>{meta.name}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: badgeColor, whiteSpace: 'nowrap' }}>
          {reauth ? STATUS_LABEL.reauth_required : item.connected ? STATUS_LABEL.connected : STATUS_LABEL.not_connected}
        </span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>{meta.desc}</p>
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0, minHeight: 16 }}>
        {item.connected && item.account_email ? `Подключён как ${item.account_email}` : ''}
      </p>
      {!item.configured ? (
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 'auto' }} disabled title="Интеграция ещё не настроена администратором">Недоступно</button>
      ) : item.connected && !reauth ? (
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 'auto' }} disabled={busy} onClick={disconnect}>Отключить</button>
      ) : (
        <button className="btn btn-accent btn-sm" style={{ marginTop: 'auto' }} disabled={busy} onClick={connect}>
          {busy ? '...' : reauth ? 'Переподключить' : `Подключить ${meta.name}`}
        </button>
      )}
    </div>
  )
}

function WebhookCard({ teamId, userId, webhooks, events, onChange, notify }) {
  const [url, setUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [expanded, setExpanded] = useState(null)

  const add = async () => {
    const u = url.trim()
    if (!/^https?:\/\//.test(u)) { notify?.('URL должен начинаться с http:// или https://'); return }
    setAdding(true)
    try { await createWebhook({ team_id: teamId, user_id: userId, url: u, events: null }); setUrl(''); onChange?.() }
    catch (e) { notify?.(e?.response?.data?.detail || 'Не удалось добавить Webhook.') }
    finally { setAdding(false) }
  }

  const remove = async (id) => {
    if (!(await confirmDialog({ title: 'Удалить Webhook?', message: 'Доставка событий на этот URL прекратится.', confirmText: 'Удалить', danger: true }))) return
    try { await deleteWebhook(id, userId); onChange?.() } catch { notify?.('Не удалось удалить.') }
  }

  const test = async (id) => {
    try { await testWebhook(id, userId); notify?.('Тестовое событие отправлено.'); setTimeout(onChange, 1500) }
    catch { notify?.('Не удалось отправить тест.') }
  }

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)' }}>Webhook</span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
        На указанные URL отправляется HTTP POST с JSON при событиях: {events.join(', ')}. Запрос подписан заголовком X-OneOnOne-Signature (HMAC-SHA256).
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <input className="input" style={{ flex: 1, minWidth: 220 }} placeholder="https://example.com/webhook"
          value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
        <button className="btn btn-accent btn-sm" disabled={adding} onClick={add}>{adding ? '...' : 'Добавить'}</button>
      </div>

      {webhooks.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Пока нет добавленных Webhook.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {webhooks.map(w => (
            <div key={w.id} style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--color-text-primary)', wordBreak: 'break-all' }}>{w.url}</span>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => test(w.id)}>Тест</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setExpanded(expanded === w.id ? null : w.id)}>
                    {expanded === w.id ? 'Скрыть' : 'История'}
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => remove(w.id)}>Удалить</button>
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6, wordBreak: 'break-all' }}>
                Секрет для проверки подписи: <span style={{ fontFamily: 'var(--font-mono)' }}>{w.secret}</span>
              </div>
              {expanded === w.id && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(w.recent_deliveries || []).length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>Доставок пока не было.</p>
                  ) : w.recent_deliveries.map(d => (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                      <span style={{ color: 'var(--color-text-secondary)' }}>{d.event_type}</span>
                      <span style={{ fontWeight: 600, color: d.status === 'success' ? 'var(--color-success, #16a34a)' : d.status === 'failed' ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                        {d.status === 'success' ? `успех (${d.status_code})` : d.status === 'failed' ? `ошибка${d.last_error ? ': ' + d.last_error : ''}` : 'в очереди'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Integrations({ user, teamId }) {
  const [data, setData] = useState(null)
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    if (!user?.id) return
    getIntegrationsStatus(user.id, teamId)
      .then(r => setData(r.data))
      .catch(() => setData({ calendars: [], webhooks: [], webhook_events: [], coming_soon: [] }))
      .finally(() => setLoading(false))
  }, [user?.id, teamId])

  useEffect(() => { load() }, [load])

  // Вернулись из OAuth-колбэка (?integrations=1) — обновим статус.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get('integrations')) { load(); window.history.replaceState({}, '', window.location.pathname) }
  }, [load])

  const notify = (m) => { setMsg(m); if (m) setTimeout(() => setMsg(''), 4000) }

  if (loading) return <div style={{ padding: '40px 0', textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  const calendars = data?.calendars || []
  const webhooks = data?.webhooks || []
  const events = data?.webhook_events || []
  const comingSoon = data?.coming_soon || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 720 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: 'var(--color-text-primary)' }}>Календари</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 12px' }}>
          Двусторонняя синхронизация встреч 1-на-1 с вашим календарём.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 14 }}>
          {calendars.map(c => <CalendarCard key={c.provider} item={c} userId={user.id} onChange={(m) => { if (typeof m === 'string') notify(m); load() }} />)}
        </div>
      </div>

      {teamId ? (
        <WebhookCard teamId={teamId} userId={user.id} webhooks={webhooks} events={events} onChange={load} notify={notify} />
      ) : (
        <div className="card" style={{ padding: 18 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Webhook</span>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '8px 0 0' }}>Выберите команду на вкладке «Команды», чтобы настроить исходящие Webhook.</p>
        </div>
      )}

      <div className="card" style={{ padding: 18 }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)' }}>Скоро</span>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '6px 0 12px' }}>Эти интеграции запланированы. Сроки пока не называем.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {comingSoon.map(s => (
            <span key={s.key} aria-disabled="true" style={{
              fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)',
              background: 'var(--color-surface-2, #f1f5f9)', border: '1px solid var(--color-border)',
              borderRadius: 999, padding: '6px 14px', cursor: 'default', userSelect: 'none',
            }}>{s.name} — скоро</span>
          ))}
        </div>
      </div>

      {msg && <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{msg}</p>}
    </div>
  )
}
