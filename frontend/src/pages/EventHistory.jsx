import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { allPages } from '../api/pages.js'
import { ACTIVITY_LABELS, actionLabel, auditDescription, entityLabel, eventStatus, statusLabel } from '../utils/eventHistory.js'
import { useI18n } from '../i18n/i18n.js'

const SHORT = { dateStyle: 'medium', timeStyle: 'short' }
const ALMATY = { ...SHORT, timeZone: 'Asia/Almaty' }
const statuses = ['all', 'draft', 'upcoming', 'active', 'completed', 'cancelled', 'suspended']

const badge = {
  draft: 'bg-gray-200 text-gray-700',
  upcoming: 'bg-blue-100 text-blue-800',
  active: 'bg-green-100 text-green-800',
  completed: 'bg-purple-100 text-purple-800',
  cancelled: 'bg-amber-100 text-amber-800',
  suspended: 'bg-red-100 text-red-800',
}

function AuditEntries({ eventId, query }) {
  const { t, date } = useI18n()
  const [entries, setEntries] = useState(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  const path = `/events/${eventId}/audit-log?${query ? `${query}&` : ''}page=`

  useEffect(() => {
    let active = true
    api(`${path}1`).then((data) => {
      if (!active) return
      setEntries(data.results)
      setHasMore(Boolean(data.next))
    }).catch((failure) => active && setError(failure.message))
    return () => { active = false }
  }, [path])

  async function loadMore() {
    const nextPage = page + 1
    setLoadingMore(true)
    setError('')
    try {
      const data = await api(`${path}${nextPage}`)
      setEntries((known) => [...known, ...data.results])
      setPage(nextPage)
      setHasMore(Boolean(data.next))
    } catch (failure) {
      setError(failure.message)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <>
      {error && <p role="alert" className="mt-4 text-red-700">{t(error)}</p>}
      {entries === null && !error && <p className="mt-4">{t('Loading activity…')}</p>}
      {entries?.length === 0 && <p className="mt-4 text-gray-600">{t('No activity matches these filters.')}</p>}
      {entries?.length > 0 && (
        <ol className="mt-4 space-y-3 border-l-2 border-gray-200 pl-5">
          {entries.map((entry) => (
            <li className="relative rounded-xl border bg-white p-4 before:absolute before:-left-[1.7rem] before:top-5 before:h-3 before:w-3 before:rounded-full before:bg-brand-600" key={entry.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <strong>{t(actionLabel(entry.action))}</strong>
                <time className="text-xs text-gray-500" dateTime={entry.created_at}>{date(entry.created_at, ALMATY)}</time>
              </div>
              {entry.description && <p className="mt-1 text-sm text-gray-700">{auditDescription(entry, t)}</p>}
              <p className="mt-2 text-xs text-gray-500">{entry.actor ? t('Actor #{id}', { id: entry.actor }) : t('System')} · {entityLabel(entry, t)}</p>
            </li>
          ))}
        </ol>
      )}
      {hasMore && <button className="mt-4 rounded border px-4 py-2" disabled={loadingMore} onClick={loadMore}>{loadingMore ? t('Loading…') : t('Load older activity')}</button>}
    </>
  )
}

function EventActivity({ event }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [duplicating, setDuplicating] = useState(false)
  const [duplicateError, setDuplicateError] = useState('')
  const canDuplicate = ['completed', 'cancelled'].includes(eventStatus(event))

  function applyFilters(submit) {
    submit.preventDefault()
    const filters = new URLSearchParams()
    for (const [name, value] of new FormData(submit.currentTarget)) {
      if (value) filters.set(name, value)
    }
    setQuery(filters.toString())
  }

  async function duplicate() {
    setDuplicating(true)
    setDuplicateError('')
    try {
      const created = await api(`/events/${event.id}/duplicate`, { method: 'POST' })
      navigate(`/organizer/events/${created.id}/edit`)
    } catch (failure) {
      setDuplicateError(failure.message)
    } finally {
      setDuplicating(false)
    }
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-xl font-semibold">{t('Activity')} · {event.title}</h2><p className="text-sm text-gray-600">{t('Newest first · Almaty time')}</p></div>
        <div className="flex flex-wrap gap-3">
          <Link to={`/organizer/events/${event.id}`} className="text-brand-700 underline">{t('Open event')}</Link>
          {canDuplicate && <button type="button" disabled={duplicating} onClick={duplicate} className="text-brand-700 underline disabled:opacity-50">
            {duplicating ? t('Duplicating…') : t('Duplicate as draft')}
          </button>}
        </div>
      </div>
      {duplicateError && <p role="alert" className="mt-3 text-red-700">{t(duplicateError)}</p>}
      <form onSubmit={applyFilters} onReset={() => setQuery('')} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block text-sm">{t('From date')}
          <input type="date" name="date_from" className="mt-1 block rounded border p-2" />
        </label>
        <label className="block text-sm">{t('To date')}
          <input type="date" name="date_to" className="mt-1 block rounded border p-2" />
        </label>
        <label className="block text-sm">{t('Activity type')}
          <select name="action" className="mt-1 block max-w-full rounded border p-2">
            <option value="">{t('All activity')}</option>
            {Object.entries(ACTIVITY_LABELS).map(([action, label]) => <option key={action} value={action}>{t(label)}</option>)}
          </select>
        </label>
        <button type="submit" className="rounded bg-brand-600 hover:bg-brand-700 px-4 py-2 text-white">{t('Apply filters')}</button>
        <button type="reset" className="rounded border px-4 py-2">{t('Clear filters')}</button>
      </form>
      <AuditEntries key={query} eventId={event.id} query={query} />
    </section>
  )
}

export default function EventHistory() {
  const { t, date } = useI18n()
  const [events, setEvents] = useState(null)
  const [status, setStatus] = useState('all')
  const [eventId, setEventId] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    allPages('/me/events')
      .then((items) => active && setEvents(items))
      .catch((failure) => active && setError(failure.message))
    return () => { active = false }
  }, [])

  const visible = events?.filter((item) => status === 'all' || eventStatus(item) === status) ?? []
  const current = visible.find((item) => item.id === eventId) ?? visible[0]

  return (
    <main>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{t('Event history')}</h1>
          <p className="mt-1 text-gray-600">{t('Event lifecycle and the append-only activity timeline.')}</p>
        </div>
        <Link to="/organizer/events" className="text-brand-700 underline">{t('Manage events')}</Link>
      </div>

      <section className="mt-6 rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="text-sm font-medium">{t('Status')}
            <select className="mt-1 block rounded border p-2" value={status} onChange={(event) => setStatus(event.target.value)}>
              {statuses.map((value) => <option key={value} value={value}>{value === 'all' ? t('All events') : t(statusLabel(value))}</option>)}
            </select>
          </label>
          <p className="text-sm text-gray-500">{visible.length === 1 ? t('1 event') : t('{count} events', { count: visible.length })}</p>
        </div>
        {events === null && !error && <p className="mt-4">{t('Loading events…')}</p>}
        {visible.length === 0 && events !== null && <p className="mt-4 text-gray-600">{t('No events have this status.')}</p>}
        {visible.length > 0 && (
          <div className="relative mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-gray-600"><tr><th className="p-3 font-medium">{t('Event')}</th><th className="p-3 font-medium">{t('Schedule')}</th><th className="p-3 font-medium">{t('Status')}</th><th className="p-3 font-medium"><span className="sr-only">{t('Timeline')}</span></th></tr></thead>
              <tbody className="divide-y">
                {visible.map((item) => {
                  const value = eventStatus(item)
                  return <tr key={item.id} className={item.id === current?.id ? 'bg-brand-50' : ''}>
                    <td className="p-3"><strong>{item.title}</strong><span className="block text-xs text-gray-500">{item.venue}</span></td>
                    <td className="whitespace-nowrap p-3">{date(item.starts_at, SHORT)}<span className="block text-xs text-gray-500">{t('to {date}', { date: date(item.ends_at, SHORT) })}</span></td>
                    <td className="p-3"><span className={`rounded px-2 py-1 text-xs font-medium ${badge[value]}`}>{t(statusLabel(value))}</span></td>
                    <td className="p-3 text-right"><button className="text-brand-700 underline" onClick={() => setEventId(item.id)}>{t('View activity')}</button></td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {error && <p role="alert" className="mt-6 rounded border border-red-300 bg-red-50 p-4 text-red-700">{t(error)}</p>}
      {current && <EventActivity key={current.id} event={current} />}
    </main>
  )
}
