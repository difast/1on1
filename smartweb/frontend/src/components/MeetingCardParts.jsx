import { fmtDate, fmtTime } from '../lib/datetime'

/*
 * Shared presentational parts of a meeting card. WHY: Lead and Member dashboards
 * render an identical date badge and note editor; only the surrounding STATE
 * differs (Lead keeps a noteState object, Member per-id maps). Keeping these
 * presentational and passing state in via props lets both reuse the exact same
 * markup without entangling their state models.
 */

export function MeetingDateBadge({ date }) {
  return (
    <div style={{
      width: 46, height: 46, borderRadius: 'var(--radius-md)',
      background: 'var(--blue-50)', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid var(--blue-200)',
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-accent)', lineHeight: 1.2 }}>{fmtDate(date)}</span>
      <span style={{ fontSize: 10, color: 'var(--blue-400)' }}>{fmtTime(date)}</span>
    </div>
  )
}

export function MeetingNoteEditor({ value, onChange, onSave, saving }) {
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-border)' }}>
      <textarea
        value={value}
        onChange={onChange}
        placeholder="Заметки к встрече (каждая строка — отдельный пункт)..."
        className="input"
        style={{ resize: 'vertical', minHeight: 72, fontSize: 13 }}
      />
      <button onClick={onSave} disabled={saving} className="btn btn-accent btn-sm" style={{ marginTop: 6 }}>
        {saving ? 'Сохранение...' : 'Сохранить'}
      </button>
    </div>
  )
}
