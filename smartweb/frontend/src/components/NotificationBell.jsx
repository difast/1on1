import { useEffect, useState } from 'react'

export default function NotificationBell({ count, onClick }) {
  const [shaking, setShaking] = useState(false)

  // Shake on first appearance of new notifications
  useEffect(() => {
    if (count > 0) {
      setShaking(true)
      const t = setTimeout(() => setShaking(false), 900)
      return () => clearTimeout(t)
    }
  }, [count])

  return (
    <button
      onClick={onClick}
      style={{
        position: 'relative', padding: 8, background: 'none', border: 'none',
        cursor: 'pointer', color: count > 0 ? '#ef4444' : 'var(--color-text-secondary)',
        borderRadius: 8, transition: 'color 0.15s, background 0.15s',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--gray-100)'; e.currentTarget.style.color = count > 0 ? '#dc2626' : 'var(--color-text-primary)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = count > 0 ? '#ef4444' : 'var(--color-text-secondary)' }}
    >
      <svg
        width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"
        style={{ animation: shaking ? 'bellShake 0.9s ease' : 'none', transformOrigin: 'top center' }}
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
      {count > 0 && (
        <span style={{
          position: 'absolute', top: 2, right: 2,
          minWidth: 18, height: 18, padding: '0 4px',
          background: '#ef4444', color: '#fff',
          fontSize: 11, fontWeight: 700, lineHeight: '18px',
          borderRadius: 20, textAlign: 'center',
          boxShadow: '0 0 0 2px var(--color-surface)',
          pointerEvents: 'none',
        }}>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  )
}
