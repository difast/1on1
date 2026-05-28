import { useState, useEffect } from 'react'
import { getKnowledgeArticles, createKnowledgeArticle, updateKnowledgeArticle, deleteKnowledgeArticle } from '../api/client'

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr)
  const d = Math.floor(diff / 86400000)
  if (d === 0) return 'сегодня'
  if (d === 1) return 'вчера'
  if (d < 7) return `${d} дн. назад`
  if (d < 30) return `${Math.floor(d / 7)} нед. назад`
  return `${Math.floor(d / 30)} мес. назад`
}

export default function KnowledgeBase({ teamId, userId, canEdit = false }) {
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)   // article being viewed
  const [editing, setEditing] = useState(null)      // article being edited (or 'new')
  const [form, setForm] = useState({ title: '', content: '' })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [search, setSearch] = useState('')

  const load = () => {
    if (!teamId) { setLoading(false); return }
    setLoading(true)
    getKnowledgeArticles(teamId)
      .then(r => setArticles(r.data))
      .catch(() => setArticles([]))
      .finally(() => setLoading(false))
  }

  useEffect(load, [teamId])

  const filtered = articles.filter(a =>
    !search || a.title.toLowerCase().includes(search.toLowerCase()) ||
    (a.content || '').toLowerCase().includes(search.toLowerCase())
  )

  const openNew = () => {
    setForm({ title: '', content: '' })
    setEditing('new')
    setSelected(null)
  }

  const openEdit = (a, e) => {
    e.stopPropagation()
    setForm({ title: a.title, content: a.content || '' })
    setEditing(a)
    setSelected(null)
  }

  const handleSave = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      if (editing === 'new') {
        const { data } = await createKnowledgeArticle({ team_id: teamId, author_id: userId, ...form })
        setArticles(prev => [data, ...prev])
      } else {
        const { data } = await updateKnowledgeArticle(editing.id, form)
        setArticles(prev => prev.map(a => a.id === data.id ? data : a))
      }
      setEditing(null)
    } catch {} finally { setSaving(false) }
  }

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    if (!window.confirm('Удалить статью?')) return
    setDeleting(id)
    try {
      await deleteKnowledgeArticle(id)
      setArticles(prev => prev.filter(a => a.id !== id))
      if (selected?.id === id) setSelected(null)
    } catch {} finally { setDeleting(null) }
  }

  // ── Article viewer ────────────────────────────────────────────────────────
  if (selected) return (
    <div style={{ maxWidth: 720 }}>
      <button
        onClick={() => setSelected(null)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-accent)', fontSize: 13, fontWeight: 600, marginBottom: 20, padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
      >
        ← Все статьи
      </button>
      <div className="card" style={{ padding: '28px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1.3 }}>{selected.title}</h2>
          {canEdit && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button onClick={(e) => openEdit(selected, e)} className="btn btn-secondary btn-sm">Редактировать</button>
              <button onClick={(e) => handleDelete(selected.id, e)} disabled={deleting === selected.id} className="btn btn-danger btn-sm">Удалить</button>
            </div>
          )}
        </div>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 20 }}>
          Обновлено {timeAgo(selected.updated_at)}
        </p>
        {selected.content
          ? <div style={{ fontSize: 14, color: 'var(--color-text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{selected.content}</div>
          : <p style={{ fontSize: 14, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Содержимое не добавлено</p>
        }
      </div>
    </div>
  )

  // ── Editor ────────────────────────────────────────────────────────────────
  if (editing) return (
    <div style={{ maxWidth: 720 }}>
      <button
        onClick={() => setEditing(null)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-accent)', fontSize: 13, fontWeight: 600, marginBottom: 20, padding: 0 }}
      >
        ← Отмена
      </button>
      <div className="card" style={{ padding: '24px 28px' }}>
        <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--color-text-primary)', marginBottom: 18 }}>
          {editing === 'new' ? 'Новая статья' : 'Редактировать'}
        </p>
        <div className="form-group">
          <label className="form-label">Заголовок *</label>
          <input
            className="input"
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            placeholder="Название статьи..."
            autoFocus
          />
        </div>
        <div className="form-group">
          <label className="form-label">Содержимое</label>
          <textarea
            className="input"
            value={form.content}
            onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
            placeholder="Текст статьи, инструкции, полезные ссылки..."
            rows={12}
            style={{ resize: 'vertical', fontSize: 14, lineHeight: 1.6 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <button onClick={() => setEditing(null)} className="btn btn-secondary">Отмена</button>
          <button onClick={handleSave} disabled={!form.title.trim() || saving} className="btn btn-accent">
            {saving ? 'Сохраняем...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )

  // ── Article list ──────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 820 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 4 }}>
            База знаний
          </h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            {articles.length} статей · общая база команды
          </p>
        </div>
        {canEdit && (
          <button onClick={openNew} className="btn btn-accent" style={{ flexShrink: 0 }}>
            + Новая статья
          </button>
        )}
      </div>

      {/* Search */}
      <input
        className="input"
        style={{ marginBottom: 16, fontSize: 14 }}
        placeholder="Поиск по статьям..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {/* List */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div className="spinner" />
        </div>
      ) : !teamId ? (
        <div className="empty-state">
          <div className="empty-icon">◎</div>
          <p className="empty-title">Команда не выбрана</p>
          <p className="empty-desc">Выберите команду, чтобы открыть базу знаний</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">◎</div>
          <p className="empty-title">{search ? 'Ничего не найдено' : 'База знаний пуста'}</p>
          <p className="empty-desc">{search ? 'Попробуйте другой запрос' : canEdit ? 'Добавьте первую статью — инструкции, процессы, полезные ссылки' : 'Тимлид ещё не добавил статьи'}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((a, i) => (
            <div
              key={a.id}
              onClick={() => setSelected(a)}
              className="card"
              style={{
                padding: '16px 20px', cursor: 'pointer',
                display: 'flex', alignItems: 'flex-start', gap: 14,
                opacity: 0, animation: `fadeSlideIn 0.3s ease ${i * 50}ms forwards`,
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-accent)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: 'var(--blue-50)', border: '1px solid var(--blue-200)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, flexShrink: 0,
              }}>
                📄
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)', marginBottom: 4 }}>{a.title}</p>
                {a.content && (
                  <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.content.replace(/\n/g, ' ')}
                  </p>
                )}
                <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 5 }}>
                  {timeAgo(a.updated_at)}
                </p>
              </div>
              {canEdit && (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <button onClick={(e) => openEdit(a, e)} className="btn btn-secondary btn-sm" style={{ fontSize: 11 }}>✏️</button>
                  <button onClick={(e) => handleDelete(a.id, e)} disabled={deleting === a.id} className="btn btn-danger btn-sm" style={{ fontSize: 11 }}>🗑</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  )
}
