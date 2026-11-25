export async function listAll(api, path) {
  const items = []
  for (let page = 1; ; page += 1) {
    const separator = path.includes('?') ? '&' : '?'
    const result = await api(`${path}${separator}page=${page}`)
    if (!Array.isArray(result?.results)) throw new Error('Сервер вернул некорректный список.')
    items.push(...result.results)
    if (!result.next) return items
  }
}

export async function loadPromoActivity(api, events) {
  const groups = await Promise.all(events.map(async (event) => {
    const campaigns = await listAll(api, `/events/${event.id}/campaigns`)
    return campaigns.map(campaign => ({
      ...campaign,
      event_title: event.title,
      organizer: event.organizer,
    }))
  }))
  return groups.flat().sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
}

const csvCell = value => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function buildCsv(columns, rows) {
  const lines = [columns.map(column => csvCell(column.label)).join(',')]
  for (const row of rows) lines.push(columns.map(column => csvCell(column.value(row))).join(','))
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

export function downloadCsv(filename, contents) {
  const blob = new Blob([contents], { type: 'text/csv;charset=utf-8' })
  downloadBlob(filename, blob)
}

export function downloadBlob(filename, blob) {
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(href), 0)
}

export function adminReportPath(kind, filters = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    const text = String(value ?? '').trim()
    if (text) query.set(key, text)
  }
  const suffix = query.toString()
  return `/admin/${kind}${suffix ? `?${suffix}` : ''}`
}

export const orderStatus = status => ({
  pending: 'Ожидает оплаты',
  confirmed: 'Подтверждён',
  cancelled: 'Отменён',
  refunded: 'Возвращён',
}[status] || status)

export const paymentStatus = status => ({ paid: 'Оплачен', refunded: 'Возвращён' }[status] || status)

export const reportStatus = status => ({ open: 'Открыта', reviewed: 'Проверена', dismissed: 'Отклонена' }[status] || status)

export const reportReason = reason => ({
  fraud: 'Мошенничество',
  misleading: 'Вводит в заблуждение',
  inappropriate: 'Недопустимое содержание',
  safety: 'Безопасность',
  other: 'Другое',
}[reason] || reason)

export const formatMoney = (minor, currency = 'KZT') => new Intl.NumberFormat('ru-KZ', {
  style: 'currency',
  currency,
}).format((minor || 0) / 100)

export const supportStatus = status => ({
  open: 'Открыто',
  in_progress: 'В работе',
  waiting_for_customer: 'Ожидает пользователя',
  resolved: 'Закрыто',
}[status] || status)

export const activationStatus = status => ({
  not_started: 'Не начато',
  in_progress: 'Заполняется',
  active: 'Активно',
  suspended: 'Приостановлено',
}[status] || status)
