import { useState } from 'react'
import { createGroupMeeting } from '../api/client'
import { toast } from '../lib/ui'
import Spinner from '../lib/Spinner'
import useEscapeKey from '../lib/useEscapeKey'

/*
 * Групповой созвон (Задача 4): назначить встречу нескольким участникам сразу или
 * всей команде. Формат 1-на-1 не затрагивается — это отдельный поток.
 */
export default function GroupMeetingModal({ members, teamId, teamLeadId, onClose, onCreated }) {
  useEscapeKey(onClose)
  const [when, setWhen] = useState('')
  const [agenda, setAgenda] = useState('')
  const [wholeTeam, setWholeTeam] = useState(false)
  const [selected, setSelected] = useState([])   // user_id[]
  const [saving, setSaving] = useState(false)

  const toggle = (uid) => setSelected(s => s.includes(uid) ? s.filter(x => x !== uid) : [...s, uid])

  const submit = async (e) => {
    e.preventDefault()
    if (!when) { toast('Укажите дату и время', 'error'); return }
    if (!wholeTeam && selected.length === 0) { toast('Выберите участников или «Вся команда»', 'error'); return }
    setSaving(true)
    try {
      const { data } = await createGroupMeeting({
        team_id: teamId,
        team_lead_id: teamLeadId,
        scheduled_date: when,
        agenda: agenda.trim() || null,
        member_ids: wholeTeam ? null : selected,
        whole_team: wholeTeam,
      })
      toast(`Групповая встреча создана (${data.length})`, 'success')
      onCreated?.(data)
      onClose()
    } catch (err) {
      const d = err?.response?.data?.detail
      toast(typeof d === 'string' ? d : 'Не удалось создать встречу', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="overlay-center" onClick={onClose} style={{ zIndex: 9700 }}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={submit} style={{ maxWidth: 480, width: '94vw' }}>
        <div className="modal-header" style={{ paddingBottom: 12 }}>
          <div>
            <span className="modal-title">Групповая встреча</span>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>
              Назначьте созвон нескольким участникам или всей команде
            </p>
          </div>
          <button type="button" className="modal-close" aria-label="Закрыть" onClick={onClose}>✕</button>
        </div>

        <div className="form-group">
          <label className="form-label">Дата и время</label>
          <input type="datetime-local" className="input" value={when} onChange={e => setWhen(e.target.value)} autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">Тема (необязательно)</label>
          <input className="input" placeholder="Например: Планёрка команды" value={agenda} onChange={e => setAgenda(e.target.value)} />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 10, cursor: 'pointer', marginBottom: 12, background: wholeTeam ? 'var(--blue-50)' : 'transparent' }}>
          <input type="checkbox" checked={wholeTeam} onChange={e => setWholeTeam(e.target.checked)} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>Вся команда</span>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>{members.length} участн.</span>
        </label>

        {!wholeTeam && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto', marginBottom: 8 }}>
            <label className="form-label">Участники</label>
            {members.length === 0 && <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>В команде нет участников</p>}
            {members.map(m => (
              <label key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: selected.includes(m.user_id) ? 'var(--blue-50)' : 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                <input type="checkbox" checked={selected.includes(m.user_id)} onChange={() => toggle(m.user_id)} />
                <span style={{ fontSize: 13.5, color: 'var(--color-text-primary)' }}>{m.name}</span>
              </label>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="button" onClick={onClose} className="btn btn-secondary">Отмена</button>
          <button type="submit" disabled={saving} className="btn btn-accent" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minWidth: 150 }}>
            {saving ? <><Spinner size={15} /> Создание...</> : 'Создать встречу'}
          </button>
        </div>
      </form>
    </div>
  )
}
