import { buildIcs, googleCalendarUrl, icsFilename } from '../utils/calendar'
import { useI18n } from '../i18n/i18n.js'

// "Add to calendar": .ics download (Apple/Outlook/any app) + Google link.
// The download is built in the browser, so it works without a backend route.
export default function AddToCalendar({ event, className = '' }) {
  const { t } = useI18n()
  const pageUrl = `${window.location.origin}/events/${event.id}`

  function download() {
    const blob = new Blob([buildIcs(event, pageUrl)], { type: 'text/calendar;charset=utf-8' })
    const href = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = icsFilename(event)
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(href), 0)
  }

  return (
    <span className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-sm ${className}`}>
      <button type="button" onClick={download} className="text-indigo-600 underline">
        {t('Add to calendar (.ics)')}
      </button>
      <a href={googleCalendarUrl(event, pageUrl)} target="_blank" rel="noopener noreferrer"
        className="text-indigo-600 underline">
        Google Calendar ↗
      </a>
    </span>
  )
}
