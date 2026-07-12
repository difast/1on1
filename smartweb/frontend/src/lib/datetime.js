// Shared ru-RU date/time formatting. WHY: the exact toLocale* option objects
// were repeated a dozen+ times across the dashboards — one place keeps the
// format identical and readable.
export const fmtDate = (v) => new Date(v).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
export const fmtTime = (v) => new Date(v).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
