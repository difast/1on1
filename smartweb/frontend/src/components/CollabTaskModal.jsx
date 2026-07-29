import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createTask } from '../api/client'
import { toast } from '../lib/ui'
import Spinner from '../lib/Spinner'
import useEscapeKey from '../lib/useEscapeKey'

/*
 * Создание совместной задачи (Задача 4): один общий заголовок и несколько
 * ответственных, у каждого — краткое описание его части. Отправляем ОДНУ задачу
 * с массивом assignees; assigned_to = первый участник (обратная совместимость).
 */
export default function CollabTaskModal({ members, teamId, assignedBy, onClose, onCreated }) {
  const { t } = useTranslation()
  useEscapeKey(onClose)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  // Стартуем с двух строк «участник + его часть».
  const [rows, setRows] = useState([{ user_id: '', part: '' }, { user_id: '', part: '' }])
  const [saving, setSaving] = useState(false)

  const setRow = (i, patch) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const addRow = () => setRows(rs => [...rs, { user_id: '', part: '' }])
  const removeRow = (i) => setRows(rs => rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs)

  const chosen = rows.filter(r => r.user_id)
  const uniqueCount = new Set(chosen.map(r => String(r.user_id))).size

  const submit = async (e) => {
    e.preventDefault()
    if (!title.trim()) { toast(t('ui.ukazhite_zagolovok_zadachi'), 'error'); return }
    if (chosen.length < 1) { toast(t('ui.vyberite_hotya_by_odnogo_uchastnika'), 'error'); return }
    if (uniqueCount !== chosen.length) { toast(t('ui.uchastniki_ne_dolzhny_povtoryatsya'), 'error'); return }

    const assignees = chosen.map(r => ({ user_id: Number(r.user_id), part_description: r.part.trim() || null }))
    setSaving(true)
    try {
      const { data } = await createTask({
        title: title.trim(),
        due_date: dueDate || null,
        team_id: teamId,
        assigned_to: assignees[0].user_id,  // первый участник — для обратной совместимости
        assigned_by: assignedBy,
        meeting_id: null,
        assignees,
      })
      toast(t('ui.sovmestnaya_zadacha_sozdana'), 'success')
      onCreated?.(data)
      onClose()
    } catch {
      toast(t('ui.ne_udalos_sozdat_zadachu_poprobuyte_esche'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="overlay-center" onClick={onClose} style={{ zIndex: 9700 }}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={submit} style={{ maxWidth: 520, width: '94vw' }}>
        <div className="modal-header" style={{ paddingBottom: 12 }}>
          <div>
            <span className="modal-title">{t('ui.sovmestnaya_zadacha_2')}</span>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>{t('ui.odna_zadacha_na_neskolkih_uchastnikov_u')}</p>
          </div>
          <button type="button" className="modal-close" aria-label={t('ui.zakryt')} onClick={onClose}><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg></button>
        </div>

        <div className="form-group">
          <label className="form-label">{t('ui.zagolovok_zadachi')}</label>
          <input className="input" placeholder={t('ui.naprimer_podgotovit_prezentaciyu')} value={title} onChange={e => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">{t('ui.srok_neobyazatelno')}</label>
          <input type="date" className="input" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </div>

        <label className="form-label" style={{ marginTop: 4 }}>{t('ui.uchastniki_i_ih_chasti')}</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                className="input input-sm"
                value={r.user_id}
                onChange={e => setRow(i, { user_id: e.target.value })}
                style={{ flex: '0 0 40%', minWidth: 0 }}
              >
                <option value="">{t('ui.uchastnik_2')}</option>
                {members.map(m => (
                  <option key={m.user_id} value={m.user_id}>{m.name}</option>
                ))}
              </select>
              <input
                className="input input-sm"
                placeholder={t('ui.chast_raboty_napr_dizayn')}
                value={r.part}
                onChange={e => setRow(i, { part: e.target.value })}
                style={{ flex: 1, minWidth: 0 }}
              />
              <button type="button" aria-label={t('ui.ubrat')} onClick={() => removeRow(i)}
                disabled={rows.length <= 1}
                style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-muted)', cursor: rows.length <= 1 ? 'default' : 'pointer', opacity: rows.length <= 1 ? 0.4 : 1 }}>
                −
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addRow} style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--color-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '4px 0' }}>{t('ui.dobavit_uchastnika')}</button>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
          <button type="button" onClick={onClose} className="btn btn-secondary">{t('ui.otmena')}</button>
          <button type="submit" disabled={saving} className="btn btn-accent" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minWidth: 140 }}>
            {saving ? <><Spinner size={15} />{t('ui.sozdanie')}</> : t('ui.sozdat_zadachu')}
          </button>
        </div>
      </form>
    </div>
  )
}
