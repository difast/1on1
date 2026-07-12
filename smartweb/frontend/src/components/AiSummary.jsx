// Shared post-call AI summary panel. WHY: Lead and Member dashboards rendered
// an identical block (one even carried a stray emoji) — one component keeps it
// in sync and consistent.
export default function AiSummary({ summary }) {
  if (!summary) return null
  return (
    <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--blue-50)', borderRadius: 8, border: '1px solid var(--blue-200)', borderLeft: '3px solid var(--color-accent)' }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-accent)', marginBottom: 5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>AI Резюме</p>
      <p style={{ fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.7, margin: 0 }}>{summary}</p>
    </div>
  )
}
