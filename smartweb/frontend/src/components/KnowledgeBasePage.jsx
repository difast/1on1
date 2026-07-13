import { useState, useEffect, useMemo } from 'react'
import { getAdminArticles } from '../api/client'
import useEscapeKey from '../lib/useEscapeKey'

/*
 * Пользовательская База знаний — полноэкранная страница только для чтения.
 *
 * Источник контента: «админские» статьи (/knowledge/admin/all), которые
 * наполняет команда OneOnOne через админ-панель. Это общий справочник продукта
 * (инструкции, процессы, гайды), одинаковый для всех пользователей, поэтому
 * здесь нет создания/редактирования — только просмотр и поиск.
 *
 * Открывается из меню профиля (рядом с «Поддержка»/«Документы»), как и другие
 * полноэкранные разделы, чтобы паттерн навигации был единым.
 */

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const d = Math.floor((Date.now() - new Date(dateStr)) / 86400000)
  if (d <= 0) return 'сегодня'
  if (d === 1) return 'вчера'
  if (d < 7) return `${d} дн. назад`
  if (d < 30) return `${Math.floor(d / 7)} нед. назад`
  if (d < 365) return `${Math.floor(d / 30)} мес. назад`
  return `${Math.floor(d / 365)} г. назад`
}

// Первый абзац как аннотация в списке.
function excerpt(content, n = 160) {
  if (!content) return ''
  const t = content.replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n).trimEnd() + '…' : t
}

const BookIcon = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
)

export default function KnowledgeBasePage({ onClose }) {
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)

  useEscapeKey(() => (selected ? setSelected(null) : onClose()))

  useEffect(() => {
    setLoading(true)
    getAdminArticles()
      .then(r => setArticles(Array.isArray(r.data) ? r.data : []))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return articles
    return articles.filter(a =>
      a.title.toLowerCase().includes(q) || (a.content || '').toLowerCase().includes(q)
    )
  }, [articles, search])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'var(--color-bg)', display: 'flex', flexDirection: 'column',
      animation: 'fadeIn 0.18s ease',
    }}>
      {/* Header — единый с другими полноэкранными разделами */}
      <div style={{
        height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-surface)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          {selected && (
            <button onClick={() => setSelected(null)} aria-label="Назад к списку"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center' }}>
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
          )}
          <span className="logo">OneOn<span className="accent">One</span></span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {selected ? `/ ${selected.title}` : '/ База знаний'}
          </span>
        </div>
        <button onClick={onClose} className="btn btn-secondary btn-sm">✕ Закрыть</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {selected ? (
          /* ── Читалка статьи ── */
          <article style={{ maxWidth: 760, width: '100%', margin: '0 auto', padding: '40px 24px 80px' }}>
            <button onClick={() => setSelected(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-accent)', fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
              ← Все статьи
            </button>
            <h1 style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.25, color: 'var(--color-text-primary)', letterSpacing: '-0.02em', margin: '0 0 12px' }}>
              {selected.title}
            </h1>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 28px' }}>
              Обновлено {timeAgo(selected.updated_at)}
            </p>
            {selected.content
              ? <div style={{ fontSize: 15.5, color: 'var(--color-text-primary)', lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{selected.content}</div>
              : <p style={{ fontSize: 15, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Содержимое ещё не добавлено.</p>}
          </article>
        ) : (
          /* ── Список + поиск ── */
          <div style={{ maxWidth: 820, width: '100%', margin: '0 auto', padding: '40px 24px 80px' }}>
            {/* Заголовок раздела */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--blue-50)', border: '1px solid var(--blue-200)', color: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <BookIcon />
              </div>
              <div>
                <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--color-text-primary)', margin: 0 }}>База знаний</h1>
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '2px 0 0' }}>Инструкции, процессы и ответы о работе с OneOnOne</p>
              </div>
            </div>

            {/* Поиск */}
            <div style={{ position: 'relative', margin: '24px 0 28px' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} aria-hidden="true">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input
                className="input"
                style={{ paddingLeft: 40, fontSize: 15, height: 46 }}
                placeholder="Поиск по базе знаний…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                aria-label="Поиск по базе знаний"
              />
            </div>

            {/* Состояния */}
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}><div className="spinner" /></div>
            ) : error ? (
              <div className="empty-state">
                <p className="empty-title">Не удалось загрузить</p>
                <p className="empty-desc">Проверьте соединение и попробуйте позже</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon" aria-hidden="true" style={{ color: 'var(--color-accent)' }}><BookIcon size={30} /></div>
                <p className="empty-title">{search ? 'Ничего не найдено' : 'База знаний пока пуста'}</p>
                <p className="empty-desc">{search ? 'Попробуйте другой запрос' : 'Статьи появятся здесь, как только их добавят'}</p>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
                  {filtered.length} {filtered.length === 1 ? 'статья' : 'статей'}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {filtered.map(a => (
                    <button key={a.id} onClick={() => setSelected(a)}
                      className="card"
                      style={{ textAlign: 'left', cursor: 'pointer', padding: '18px 20px', display: 'flex', alignItems: 'flex-start', gap: 16, background: 'var(--color-surface)', border: '1px solid var(--color-border)', transition: 'border-color 0.15s, transform 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-accent)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.transform = 'none' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--blue-50)', border: '1px solid var(--blue-200)', color: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h6" /></svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)', margin: '0 0 4px' }}>{a.title}</p>
                        {a.content && <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: 0 }}>{excerpt(a.content)}</p>}
                        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '8px 0 0' }}>Обновлено {timeAgo(a.updated_at)}</p>
                      </div>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
