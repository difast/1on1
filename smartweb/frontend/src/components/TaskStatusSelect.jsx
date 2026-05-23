const STATUS_STYLE = {
  in_progress: { bg: '#dbeafe', color: '#1d40ae' },
  blocked:     { bg: '#fee2e2', color: '#dc2626' },
  review:      { bg: '#fef3c7', color: '#b45309' },
  done:        { bg: '#dcfce7', color: '#16a34a' },
}

export const STATUS_LABEL = {
  in_progress: 'В работе',
  blocked: 'Блокер',
  review: 'На ревью',
  done: 'Готово',
}

const LEAD_OPTIONS   = ['in_progress', 'blocked', 'review', 'done']
const MEMBER_OPTIONS = ['in_progress', 'blocked', 'review']

export default function TaskStatusSelect({ status, onChange, canMarkDone = true }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.in_progress
  const options = canMarkDone ? LEAD_OPTIONS : MEMBER_OPTIONS

  return (
    <select
      value={status || 'in_progress'}
      onChange={e => { e.stopPropagation(); onChange(e.target.value) }}
      onClick={e => e.stopPropagation()}
      style={{
        fontSize: 11, fontWeight: 600,
        padding: '4px 24px 4px 9px',
        borderRadius: 9999,
        border: 'none',
        cursor: 'pointer',
        background: s.bg,
        color: s.color,
        appearance: 'none',
        WebkitAppearance: 'none',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 7px center',
        backgroundSize: '8px 5px',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='currentColor'/%3E%3C/svg%3E")`,
        outline: 'none',
        flexShrink: 0,
        minWidth: 80,
        fontFamily: 'inherit',
      }}
    >
      {options.map(o => (
        <option key={o} value={o} style={{ background: '#fff', color: '#1e2333', fontWeight: 500 }}>
          {STATUS_LABEL[o]}
        </option>
      ))}
    </select>
  )
}
