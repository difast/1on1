// Shared meeting-status presentation. WHY: Lead and Member dashboards each kept
// their own (slightly divergent) status→label/badge maps — one source keeps the
// wording and colours identical everywhere.
const BADGE = {
  scheduled: 'badge-blue', confirmed: 'badge-green', completed: 'badge-gray',
  in_progress: 'badge-green', cancelled: 'badge-red', declined: 'badge-red',
  requested: 'badge-amber',
}
const LABEL = {
  scheduled: 'Запланирована', confirmed: 'Подтверждена', completed: 'Завершена',
  in_progress: 'Идёт созвон', cancelled: 'Отменена', declined: 'Отклонена',
  requested: 'Запрошена',
}

export const meetingStatusBadge = (status) => BADGE[status] || 'badge-gray'
export const meetingStatusLabel = (status) => LABEL[status] || status
