import { useState, useEffect } from 'react'
import { getManagers, createManager, updateManager, deleteManager } from '../api/client'
import { toast, confirmDialog } from '../lib/ui'

// Вкладка «Сотрудники» (задача 2): полный CRUD над реестром сотрудников
// (тот же backend-реестр, что и выделенные менеджеры — без параллельной системы).
// Роли согласованы с ролевой моделью продукта.
const ROLES = [
  { value: 'admin', label: 'Администратор' },
  { value: 'manager', label: 'Менеджер' },
  { value: 'support', label: 'Поддержка' },
]
const ROLE_LABEL = Object.fromEntries(ROLES.map(r => [r.value, r.label]))
const ROLE_BADGE = { admin: 'badge-red', manager: 'badge-blue', support: 'badge-amber' }

const EMPTY = { name: '', role: 'manager', email: '', contact: '', responsibility: '' }

export default function AdminEmployees() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState(null)  // null = создаём нового
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    getManagers().then(r => setList(r.data)).catch(() => setList([])).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const startCreate = () => { setEditingId(null); setForm(EMPTY) }
  const startEdit = (e) => {
    setEditingId(e.id)
    setForm({ name: e.name || '', role: e.role || 'manager', email: e.email || '', contact: e.contact || '', responsibility: e.responsibility || '' })
  }

  const handleSave = async (ev) => {
    ev.preventDefault()
    if (!form.name.trim()) { toast('Укажите имя сотрудника', 'error'); return }
    setSaving(true)
    try {
      if (editingId) {
        const { data } = await updateManager(editingId, form)
        setList(prev => prev.map(m => m.id === editingId ? data : m))
        toast('Изменения сохранены', 'success')
      } else {
        const { data } = await createManager(form)
        setList(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
        toast('Сотрудник добавлен', 'success')
      }
      startCreate()
    } catch {
      toast('Не удалось сохранить', 'error')
    } finally { setSaving(false) }
  }

  const handleDelete = async (e) => {
    if (!await confirmDialog({
      title: 'Удалить сотрудника?',
      message: `${e.name} будет снят со всех назначений. Действие необратимо.`,
      confirmText: 'Удалить', cancelText: 'Отмена', danger: true,
    })) return
    await deleteManager(e.id).catch(() => {})
    setList(prev => prev.filter(m => m.id !== e.id))
    if (editingId === e.id) startCreate()
    toast('Сотрудник удалён', 'success')
  }

  const field = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 20, alignItems: 'start' }} className="admin-employees-grid">
      {/* Список сотрудников */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <p style={{ fontWeight: 600, fontSize: 14, margin: 0 }}>Сотрудники ({list.length})</p>
        </div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}><div className="spinner" /></div>
        ) : list.length === 0 ? (
          <div style={{ padding: '32px 8px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: 'var(--color-text-secondary)' }}>Сотрудников пока нет</p>
            <p style={{ fontSize: 13 }}>Добавьте первого сотрудника в форме справа.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {list.map(e => (
              <div key={e.id} style={{
                border: '1px solid var(--color-border)', borderRadius: 10, padding: '12px 14px',
                background: editingId === e.id ? 'var(--color-bg)' : 'var(--color-surface)',
                borderColor: editingId === e.id ? 'var(--color-accent)' : 'var(--color-border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div className="avatar avatar-sm avatar-accent">{(e.name || '?').charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 600, fontSize: 14, margin: 0, color: 'var(--color-text-primary)' }}>{e.name}</p>
                    {e.responsibility && <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '2px 0 0' }}>{e.responsibility}</p>}
                  </div>
                  <span className={`badge ${ROLE_BADGE[e.role] || 'badge-gray'}`} style={{ fontSize: 11 }}>{ROLE_LABEL[e.role] || e.role}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => startEdit(e)} className="btn btn-secondary btn-sm" style={{ fontSize: 12 }}>Изменить</button>
                    <button onClick={() => handleDelete(e)}
                      style={{ fontSize: 12, padding: '5px 12px', borderRadius: 8, border: '1px solid #fecdd3', cursor: 'pointer', fontWeight: 600, background: '#fff1f2', color: '#be123c' }}>
                      Удалить
                    </button>
                  </div>
                </div>
                {(e.email || e.contact) && (
                  <div style={{ display: 'flex', gap: 16, marginTop: 8, paddingLeft: 42, flexWrap: 'wrap' }}>
                    {e.email && <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Email: {e.email}</span>}
                    {e.contact && <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Контакт: {e.contact}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Форма добавления/изменения */}
      <form onSubmit={handleSave} className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 16 }}>
        <p style={{ fontWeight: 600, fontSize: 14, margin: 0 }}>{editingId ? 'Изменить сотрудника' : 'Добавить сотрудника'}</p>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ fontSize: 13 }}>Имя<span style={{ color: 'var(--color-danger)', marginLeft: 3 }}>*</span></label>
          <input className="input" value={form.name} onChange={e => field('name', e.target.value)} placeholder="Иван Петров" required />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ fontSize: 13 }}>Роль</label>
          <select className="input" value={form.role} onChange={e => field('role', e.target.value)}>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ fontSize: 13 }}>Email</label>
          <input className="input" type="email" value={form.email} onChange={e => field('email', e.target.value)} placeholder="ivan@company.com" />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ fontSize: 13 }}>Контакт</label>
          <input className="input" value={form.contact} onChange={e => field('contact', e.target.value)} placeholder="Telegram, телефон" />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ fontSize: 13 }}>Зона ответственности</label>
          <textarea className="input" value={form.responsibility} onChange={e => field('responsibility', e.target.value)}
            placeholder="Например: клиенты Enterprise, поддержка RU" rows={2} style={{ resize: 'none' }} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button type="submit" disabled={saving} className="btn btn-accent" style={{ flex: 1 }}>
            {saving ? 'Сохранение...' : editingId ? 'Сохранить' : 'Добавить'}
          </button>
          {editingId && (
            <button type="button" onClick={startCreate} className="btn btn-secondary">Отмена</button>
          )}
        </div>
      </form>
    </div>
  )
}
