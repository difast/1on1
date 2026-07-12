/*
 * Shared empty state. WHY: the dashboards each hand-rolled the same
 * icon+title+desc block with an inconsistent glyph (◎ vs ○). One component
 * gives a single visual language and a real (purposeful) icon instead of a
 * decorative dingbat, and removes duplicated markup.
 */
const DefaultIcon = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 8l1.6-3.2A2 2 0 0 1 7.4 4h9.2a2 2 0 0 1 1.8 1.1L20 8" />
    <path d="M4 8v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
    <path d="M4 8h5l1 2h4l1-2h5" />
  </svg>
)

export default function EmptyState({ title, desc, icon, action, style }) {
  return (
    <div className="empty-state" style={style}>
      <div className="empty-icon" aria-hidden="true">{icon || <DefaultIcon />}</div>
      {title && <p className="empty-title">{title}</p>}
      {desc && <p className="empty-desc">{desc}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  )
}
