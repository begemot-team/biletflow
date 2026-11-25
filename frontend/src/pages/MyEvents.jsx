import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { publicationLabel } from '../utils/eventHistory.js'
import { useI18n } from '../i18n/i18n.js'

const SHORT = { dateStyle: 'medium', timeStyle: 'short' }

// Organizer's own events, drafts included (GET /me/events).
function MyEvents() {
  const { t, date } = useI18n()
  const [events, setEvents] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    api('/me/events')
      .then((data) => active && setEvents(data.results))
      .catch((err) => active && setError(err.message))
    return () => { active = false }
  }, [])

  return (
    <main className="max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{t('My events')}</h1>
        <Link to="/organizer/events/new" className="rounded bg-brand-600 hover:bg-brand-700 px-4 py-2 text-white">
          {t('Create event')}
        </Link>
      </div>
      {error && <p role="alert" className="mt-6 text-red-600">{t(error)}</p>}
      {events === null && !error && <p className="mt-6">{t('Loading…')}</p>}
      {events?.length === 0 && <p className="mt-6 text-gray-600">{t('You have no events yet.')}</p>}
      {events?.length > 0 && (
        <ul className="mt-6 divide-y rounded-xl border bg-white">
          {events.map((ev) => (
            <li key={ev.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <span>
                <strong>{ev.title}</strong>
                <span className={`ml-2 rounded px-2 py-0.5 text-xs ${ev.published && !ev.cancelled_at ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'}`}>
                  {t(publicationLabel(ev))}
                </span>
                <span className="block text-sm text-gray-600">
                  {date(ev.starts_at, SHORT)} · {ev.venue}
                </span>
              </span>
              <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <Link to={`/organizer/events/${ev.id}`} className="text-brand-700 underline">{t('Sales')}</Link>
                {!ev.cancelled_at && <Link to={`/organizer/events/${ev.id}/edit`} className="text-brand-700 underline">
                  {t('Edit & tickets')}
                </Link>}
                <Link to={`/organizer/events/${ev.id}/staff`} className="text-brand-700 underline">{t('Event Admins')}</Link>
                <Link to={`/organizer/analytics?event=${ev.id}`} className="text-brand-700 underline">{t('Analytics')}</Link>
                {ev.published && (
                  <Link to={`/events/${ev.id}`} className="text-brand-700 underline">{t('Public page')}</Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

export default MyEvents
