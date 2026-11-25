import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, fieldErrors } from '../api/client'
import TicketTypes from '../components/TicketTypes.jsx'
import { categoryColors } from '../utils/categoryColors'
import { useI18n } from '../i18n/i18n.js'

const CATEGORIES = ['music', 'education', 'sports', 'tech', 'arts', 'business', 'other']

const empty = {
  title: '', date: '', time: '', duration: '2', venue: '', category: '',
  capacity: '100', description: '',
  registration_opens_at: '', registration_closes_at: '',
}

// date + time are the browser's local zone; the API needs ISO with an offset.
function toRange({ date, time, duration }) {
  if (!date || !time) return {}
  const start = new Date(`${date}T${time}`)
  const end = new Date(start.getTime() + Number(duration) * 60 * 60 * 1000)
  return { starts_at: start.toISOString(), ends_at: end.toISOString() }
}

// <input type="datetime-local"> holds local wall time without a zone.
function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null)

// Saved event -> form fields, in the browser's local zone (inverse of toRange).
function toForm(event) {
  const start = new Date(event.starts_at)
  const pad = (n) => String(n).padStart(2, '0')
  return {
    title: event.title,
    date: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    time: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
    duration: String((new Date(event.ends_at) - start) / (60 * 60 * 1000)),
    venue: event.venue,
    category: event.category,
    capacity: String(event.capacity),
    description: event.description,
    registration_opens_at: toLocalInput(event.registration_opens_at),
    registration_closes_at: toLocalInput(event.registration_closes_at),
  }
}

// PATCH only what changed: re-sending an unchanged start time of a running
// event would fail the "must be in the future" check.
function changes(body, event) {
  const same = (key) => key.endsWith('_at')
    ? new Date(body[key]).getTime() === new Date(event[key]).getTime()
    : body[key] === event[key]
  return Object.fromEntries(Object.entries(body).filter(([key]) => !same(key)))
}

const SHORT = { dateStyle: 'medium', timeStyle: 'short' }

function Input({ label, error, className = '', ...props }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm">{label}</span>
      <input {...props} aria-invalid={Boolean(error)}
        className="mt-1 w-full rounded border bg-white px-3 py-2 focus:outline-2 focus:outline-brand-500" />
      {error && <span className="mt-1 block text-sm text-red-600">{error}</span>}
    </label>
  )
}

function CreateEvent() {
  const { t, date } = useI18n()
  const { id } = useParams() // set on /organizer/events/:id/edit
  const navigate = useNavigate()
  const [form, setForm] = useState(empty)
  const [errors, setErrors] = useState({})
  const [event, setEvent] = useState(null) // saved draft from the API
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id || String(event?.id) === id) return
    let active = true
    api(`/events/${id}`)
      .then((data) => {
        if (!active) return
        setEvent(data)
        setForm(toForm(data))
      })
      .catch((err) => active && setErrors({ form: err.status === 404 ? 'Event not found.' : err.message }))
    return () => { active = false }
  }, [id, event?.id])

  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value })
  const range = toRange(form)

  async function saveDraft(e) {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    const body = {
      title: form.title,
      description: form.description,
      venue: form.venue,
      category: form.category,
      capacity: Number(form.capacity),
      registration_opens_at: fromLocalInput(form.registration_opens_at),
      registration_closes_at: fromLocalInput(form.registration_closes_at),
      ...range,
    }
    try {
      if (event) {
        setEvent(await api(`/events/${event.id}`, { method: 'PATCH', body: changes(body, event) }))
      } else {
        const created = await api('/events', { method: 'POST', body })
        setEvent(created)
        // A reload now reopens this draft instead of an empty form.
        navigate(`/organizer/events/${created.id}/edit`, { replace: true })
      }
    } catch (err) {
      const errs = fieldErrors(err)
      setErrors({
        ...errs,
        date: errs.starts_at,
        duration: errs.ends_at,
        form: errs.detail ?? errs.non_field_errors,
      })
    } finally {
      setBusy(false)
    }
  }

  async function setPublished(published) {
    setBusy(true)
    try {
      setEvent(await api(`/events/${event.id}/publish`, { method: 'POST', body: { published } }))
    } catch (err) {
      setErrors({ form: err.message })
    } finally {
      setBusy(false)
    }
  }

  if (event?.cancelled_at) return (
    <main>
      <h2 className="text-2xl">{event.title}</h2>
      <p className="mt-2">{t('This event has been cancelled.')}</p>
      <Link to={`/organizer/events/${id}`} className="mt-3 inline-block text-brand-700 underline">{t('View sales and orders')}</Link>
    </main>
  )

  return (
    <main className="grid gap-8 md:grid-cols-2 md:divide-x md:divide-gray-300">
      <form onSubmit={saveDraft} className="space-y-4 rounded-lg border border-brand-200 bg-brand-50 p-6" noValidate>
        <h2 className="text-2xl">{id ? t('Edit Event') : t('Create Event')}</h2>
        <Input label={t('Event name')} name="title" required maxLength={200}
          value={form.title} onChange={update} error={t(errors.title)} />
        <div className="grid grid-cols-3 gap-3">
          <Input label={t('Date')} name="date" type="date" required
            value={form.date} onChange={update} error={t(errors.date)} />
          <Input label={t('Time')} name="time" type="time" required
            value={form.time} onChange={update} />
          <Input label={t('Duration (h)')} name="duration" type="number" min="0.5" step="0.5" required
            value={form.duration} onChange={update} error={t(errors.duration)} />
        </div>
        <p className="text-xs text-gray-600">
          {t('Time zone')}: {Intl.DateTimeFormat().resolvedOptions().timeZone}
        </p>
        <Input label={t('Location')} name="venue" required maxLength={300}
          value={form.venue} onChange={update} error={t(errors.venue)} />
        <Input label={t('Category')} name="category" list="categories" maxLength={50}
          value={form.category} onChange={update} error={t(errors.category)} />
        <datalist id="categories">
          {CATEGORIES.map((c) => <option key={c} value={c} label={t(c)} />)}
        </datalist>
        {/* Not in the wireframe, but capacity is required by POST /events */}
        <Input label={t('Capacity')} name="capacity" type="number" min="1" max="1000000" required
          value={form.capacity} onChange={update} error={t(errors.capacity)} />
        {/* SRS 4.2: optional; empty means open from publication until the event starts */}
        <div className="grid grid-cols-2 gap-3">
          <Input label={t('Registration opens (optional)')} name="registration_opens_at" type="datetime-local"
            value={form.registration_opens_at} onChange={update} error={t(errors.registration_opens_at)} />
          <Input label={t('Registration closes (optional)')} name="registration_closes_at" type="datetime-local"
            value={form.registration_closes_at} onChange={update} error={t(errors.registration_closes_at)} />
        </div>
        <label className="block">
          <span className="text-sm">{t('Description')}</span>
          <textarea name="description" rows={3} value={form.description} onChange={update}
            className="mt-1 w-full rounded border bg-white px-3 py-2" />
        </label>
        {errors.form && <p role="alert" className="text-sm text-red-600">{t(errors.form)}</p>}
        <button disabled={busy || event?.published}
          className="rounded bg-brand-600 hover:bg-brand-700 px-5 py-2 text-white disabled:opacity-50">
          {event ? t('Save changes') : t('Save draft')}
        </button>
      </form>

      {/* "Event builder": live preview of what attendees will see + publish controls */}
      <section className="md:pl-8" aria-label={t('Event builder')}>
        <p className="text-sm uppercase tracking-wide text-gray-500">{t('Preview')}</p>
        <article className="mt-3 rounded-xl border bg-white p-6">
          {form.category && (
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${categoryColors(form.category).soft}`}>{t(form.category)}</span>
          )}
          <h3 className="mt-3 text-2xl font-semibold">{form.title || t('Event name')}</h3>
          <p className="mt-2 text-gray-600">
            {range.starts_at ? date(range.starts_at, SHORT) : t('Date & time')}
            {' · '}
            {form.venue || t('Location')}
          </p>
          {form.description && <p className="mt-4 whitespace-pre-line">{form.description}</p>}
        </article>

        {event && (
          <div className="mt-6 space-y-3">
            <p>
              {t('Status')}:{' '}
              <strong>{event.published ? t('Published') : t('Draft')}</strong>
            </p>
            {event.published ? (
              <>
                <Link to={`/events/${event.id}`} className="text-brand-700 underline">
                  {t('View public page')}
                </Link>
                <button type="button" onClick={() => setPublished(false)} disabled={busy}
                  className="ml-4 rounded border px-4 py-2">
                  {t('Unpublish')}
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setPublished(true)} disabled={busy}
                className="rounded bg-emerald-700 hover:bg-emerald-800 px-5 py-2 text-white disabled:opacity-50">
                {t('Publish')}
              </button>
            )}
          </div>
        )}
        {event && <TicketTypes eventId={event.id} />}
      </section>
    </main>
  )
}

export default CreateEvent
