// Shared meeting-status presentation. WHY: Lead and Member dashboards each kept
// their own (slightly divergent) status→label/badge maps — one source keeps the
// wording and colours identical everywhere.
const BADGE = {
  scheduled: 'badge-blue', confirmed: 'badge-green', completed: 'badge-gray',
  in_progress: 'badge-green', cancelled: 'badge-red', declined: 'badge-red',
  requested: 'badge-amber',
}
// Ключ статуса в словаре: подпись собирает вызывающий через t(), поэтому
// смена языка меняет её без пересборки этого модуля.
const LABEL_KEY = {
  scheduled: 'scheduled', confirmed: 'confirmed', completed: 'completed',
  in_progress: 'live', cancelled: 'cancelled', declined: 'declined',
  requested: 'requested',
}

export const meetingStatusBadge = (status) => BADGE[status] || 'badge-gray'
export const meetingStatusLabel = (status, t) =>
  (LABEL_KEY[status] ? t(`labels.meetingStatus.${LABEL_KEY[status]}`) : status)
