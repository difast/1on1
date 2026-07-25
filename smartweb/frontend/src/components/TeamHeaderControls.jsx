import { useState, useRef, useEffect } from 'react'
import useEscapeKey from '../lib/useEscapeKey'

/*
 * Компактные иконки-кнопки справа от названия команды (Задача 1).
 *
 * Раньше на экране «Мои команды» был крупный блок с кодом приглашения и
 * четырьмя действиями, а под ним — широкая строка поиска. Теперь это две
 * иконки: управление командой (раскрывает поповер с кодом приглашения и всеми
 * действиями) и поиск (раскрывает инлайн-поле). Функционал не потерян —
 * изменился только способ доступа. hover-анимация — общий класс .icon-hover.
 */
export default function TeamHeaderControls({
  teamName,
  inviteCode,
  copied,
  onCopyInvite,
  regenerating,
  onRegenerate,
  onAddMember,
  onOpenOrg,
  orgLabel,
  searchQuery,
  onSearchChange,
}) {
  const [manageOpen, setManageOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const manageRef = useRef(null)
  const searchRef = useRef(null)
  const searchInputRef = useRef(null)

  // Esc закрывает то, что открыто (единый паттерн с остальными оверлеями).
  useEscapeKey(() => { setManageOpen(false); setSearchOpen(false) }, manageOpen || searchOpen)

  // Клик вне поповера/поля — сворачиваем обратно в иконку. Поиск сворачиваем
  // только если он пустой (иначе пользователь потерял бы активный фильтр).
  useEffect(() => {
    if (!manageOpen && !searchOpen) return
    const onDown = (e) => {
      if (manageOpen && manageRef.current && !manageRef.current.contains(e.target)) {
        setManageOpen(false)
      }
      if (searchOpen && searchRef.current && !searchRef.current.contains(e.target)) {
        if (!searchQuery.trim()) setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [manageOpen, searchOpen, searchQuery])

  // Открытие поиска фокусирует поле; открытие одного меню закрывает другое.
  const toggleManage = () => { setManageOpen(v => !v); setSearchOpen(false) }
  const toggleSearch = () => {
    setManageOpen(false)
    setSearchOpen(v => {
      const next = !v
      if (next) setTimeout(() => searchInputRef.current?.focus(), 0)
      return next
    })
  }

  const collapseSearchIfEmpty = () => { if (!searchQuery.trim()) setSearchOpen(false) }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      {teamName && (
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>
          {teamName}
        </span>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
        {/* ── Управление командой ── */}
        <div ref={manageRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className={`head-icon-btn icon-hover${manageOpen ? ' active' : ''}`}
            onClick={toggleManage}
            aria-label="Управление командой"
            aria-expanded={manageOpen}
            title="Управление командой и приглашения"
          >
            {/* Силуэт людей с плюсом — приглашение участников */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="16" y1="11" x2="22" y2="11" />
            </svg>
          </button>

          {manageOpen && (
            <div className="head-pop" role="menu">
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue-600)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Код приглашения
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: 'var(--blue-700)' }}>
                  {inviteCode || '—'}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="btn btn-accent btn-sm" onClick={onCopyInvite}>
                  {copied ? 'Скопировано' : 'Скопировать ссылку'}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={onRegenerate} disabled={regenerating} title="Сгенерировать новый код">
                  {regenerating ? '...' : 'Новый код'}
                </button>
                <button className="btn btn-accent-ghost btn-sm" onClick={() => { setManageOpen(false); onAddMember() }}>
                  Добавить участника
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => { setManageOpen(false); onOpenOrg() }} title={orgLabel}>
                  {orgLabel}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Поиск участников: инлайн-раскрытие из иконки (не поповер) ──
            При клике на лупу справа от неё динамически вырастает строка поиска
            прямо в шапке; ввод фильтрует участников команды. Пустое поле при
            потере фокуса/клике вне сворачивается обратно в иконку. */}
        <div ref={searchRef} className="thc-search">
          {searchOpen ? (
            <div className="thc-search-field">
              <span className="thc-search-loupe" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => onSearchChange(e.target.value)}
                onBlur={collapseSearchIfEmpty}
                placeholder="Поиск участников по имени или email"
                className="thc-search-input"
                aria-label="Поиск участников"
              />
              <button
                type="button"
                className="thc-search-clear icon-hover"
                onMouseDown={e => e.preventDefault()}
                onClick={() => { onSearchChange(''); setSearchOpen(false) }}
                aria-label="Закрыть поиск"
                title="Закрыть"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="head-icon-btn icon-hover"
              onClick={toggleSearch}
              aria-label="Поиск участников"
              aria-expanded={searchOpen}
              title="Поиск участников"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
