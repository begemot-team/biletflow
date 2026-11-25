import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, fieldErrors } from '../api/client'
import { useAuth } from '../auth/auth'
import {
  ATTENDEE_CATEGORIES, PLATFORM_CATEGORIES, STATUSES, caseHeader, isSupportSide, mergeMessages, statusLabel,
} from '../utils/support'
import { supportAssignees } from '../utils/staff'
import { useI18n } from '../i18n/i18n.js'

const SHORT = { dateStyle: 'medium', timeStyle: 'short' }
const POLL_MS = 10000 // the API has no websockets; clients poll ?after=
const HEADER_EVERY = 3 // also refresh status/assignment every 30 s without new messages

// /support/:id — one case and its message thread (the link in support emails).
// The requester and the support side (event owner, Event Admin with
// can_manage_support, platform admin) both reply here; only the support side
// changes status and assignment.
function CaseThread({ id }) {
  const { t, date } = useI18n()
  const { user } = useAuth()
  const [supportCase, setSupportCase] = useState(null)
  const [messages, setMessages] = useState([])
  const [reply, setReply] = useState('')
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [assignees, setAssignees] = useState(null) // null: may only assign self
  const lastId = useRef(0)
  const bottom = useRef(null)

  const addMessages = useCallback((incoming) => {
    if (incoming.length === 0) return
    lastId.current = Math.max(lastId.current, ...incoming.map((m) => m.id))
    setMessages((thread) => mergeMessages(thread, incoming))
  }, [])

  useEffect(() => {
    let active = true

    const load = () => api(`/support-cases/${id}`).then((data) => {
      if (!active) return
      setSupportCase(caseHeader(data))
      addMessages(data.messages)
    })

    load().catch((err) => active && setError(err.status === 404 ? 'Case not found.' : err.message))

    let ticks = 0
    const timer = setInterval(() => {
      if (document.hidden || lastId.current === 0) return
      ticks += 1
      api(`/support-cases/${id}/messages?after=${lastId.current}`)
        .then((incoming) => {
          if (!active) return
          addMessages(incoming)
          // A new reply may come with a status change; staff may also resolve
          // or reassign a case without writing anything.
          if (incoming.length > 0 || ticks % HEADER_EVERY === 0) load().catch(() => {})
        })
        .catch(() => {}) // try again on the next tick
    }, POLL_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [id, addMessages])

  // The event owner (or a platform admin) may hand the case to an Event Admin
  // with support rights. Event Admins cannot list staff (404): they keep
  // "Assign to me".
  const eventId = supportCase?.event
  const supportSide = supportCase ? isSupportSide(supportCase, user) : false
  useEffect(() => {
    if (!eventId || !supportSide) return
    let active = true
    api(`/events/${eventId}/staff`)
      .then((page) => active && setAssignees(supportAssignees(user, page.results)))
      .catch(() => {})
    return () => { active = false }
  }, [eventId, supportSide, user])

  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: 'nearest' })
  }, [messages.length])

  async function send(e) {
    e.preventDefault()
    if (busy || !reply.trim()) return
    setBusy(true)
    setActionError(null)
    try {
      const message = await api(`/support-cases/${id}/messages`, { method: 'POST', body: { body: reply } })
      addMessages([message])
      setReply('')
      // The requester's reply moves "waiting for customer" back to "in progress".
      setSupportCase(caseHeader(await api(`/support-cases/${id}`)))
    } catch (err) {
      setActionError(fieldErrors(err).body ?? err.message)
    } finally {
      setBusy(false)
    }
  }

  async function change(body) {
    setBusy(true)
    setActionError(null)
    try {
      setSupportCase(caseHeader(await api(`/support-cases/${id}`, { method: 'PATCH', body })))
    } catch (err) {
      setActionError(fieldErrors(err).assigned_to ?? err.message)
    } finally {
      setBusy(false)
    }
  }

  if (error) return <p role="alert" className="mx-auto max-w-3xl px-6 py-20">{t(error)}</p>
  if (!supportCase) return <p className="mx-auto max-w-3xl px-6 py-20">{t('Loading…')}</p>

  const staff = isSupportSide(supportCase, user)
  const categories = supportCase.kind === 'platform' ? PLATFORM_CATEGORIES : ATTENDEE_CATEGORIES
  const resolved = supportCase.status === 'resolved'
  const reopenLink = supportCase.ticket ? `?ticket=${supportCase.ticket}`
    : supportCase.order ? `?order=${supportCase.order}`
      : supportCase.event ? `?event=${supportCase.event}` : ''

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link to="/support" className="text-sm text-gray-500">← {t('Support')}</Link>
      <h1 className="mt-2 text-3xl font-bold">{supportCase.subject}</h1>
      <p className="mt-1 text-sm text-gray-600">
        #{supportCase.id} · {t(categories[supportCase.category] ?? supportCase.category)}
        {supportCase.ticket && <> · <Link to={`/tickets/${supportCase.ticket}`} className="underline">{t('Ticket #{id}', { id: supportCase.ticket })}</Link></>}
        {!supportCase.ticket && supportCase.order && ` · ${t('Order #{id}', { id: supportCase.order })}`}
        {supportCase.event && <> · <Link to={`/events/${supportCase.event}`} className="underline">{t('Event')}</Link></>}
        {staff && ` · ${t('from {email}', { email: supportCase.requester_email })}`}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <span className={`rounded px-2 py-0.5 ${resolved ? 'bg-gray-200 text-gray-700' : 'bg-amber-100 text-amber-800'}`}>
          {t(statusLabel(supportCase.status, staff))}
        </span>
        <span className="text-gray-600">
          {supportCase.assigned_to_email ? t('Assigned to {email}', { email: supportCase.assigned_to_email }) : t('Not assigned yet')}
        </span>
        {staff && (
          <>
            <label>
              <span className="sr-only">{t('Status')}</span>
              <select value={supportCase.status} disabled={busy} onChange={(e) => change({ status: e.target.value })}
                className="rounded border bg-white px-2 py-1">
                {Object.entries(STATUSES).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
              </select>
            </label>
            {assignees ? (
              <label>
                <span className="sr-only">{t('Assigned to')}</span>
                <select value={supportCase.assigned_to ?? ''} disabled={busy}
                  onChange={(e) => change({ assigned_to: e.target.value ? Number(e.target.value) : null })}
                  className="max-w-full rounded border bg-white px-2 py-1">
                  <option value="">{t('Not assigned')}</option>
                  {assignees.map((a) => <option key={a.id} value={a.id}>{a.id === user.id ? t('Me ({email})', { email: a.email }) : a.label}</option>)}
                  {supportCase.assigned_to && !assignees.some((a) => a.id === supportCase.assigned_to) && (
                    <option value={supportCase.assigned_to}>{supportCase.assigned_to_email}</option>
                  )}
                </select>
              </label>
            ) : supportCase.assigned_to === user.id ? (
              <button type="button" disabled={busy} onClick={() => change({ assigned_to: null })}
                className="text-brand-700 underline disabled:opacity-50">{t('Unassign me')}</button>
            ) : (
              <button type="button" disabled={busy} onClick={() => change({ assigned_to: user.id })}
                className="text-brand-700 underline disabled:opacity-50">{t('Assign to me')}</button>
            )}
          </>
        )}
      </div>

      <ol className="mt-6 space-y-3" aria-live="polite">
        {messages.map((m) => {
          const mine = m.author === user.id
          return (
            <li key={m.id} className={`max-w-[85%] rounded-xl border p-3 ${mine ? 'ml-auto bg-brand-50' : 'bg-white'}`}>
              <p className="text-xs text-gray-500">
                {mine ? t('You') : m.author === supportCase.requester ? m.author_email : `${m.author_email} · ${t('support')}`}
                {' · '}{date(m.created_at, SHORT)}
              </p>
              {/* Plain text: never render message bodies as HTML */}
              <p className="mt-1 whitespace-pre-wrap break-words">{m.body}</p>
            </li>
          )
        })}
      </ol>
      <div ref={bottom} />

      {resolved ? (
        <p className="mt-6 rounded-xl border bg-gray-50 p-4 text-sm">
          {t('This case is resolved and closed for replies.')}{' '}
          {!staff && <Link to={`/support/new${reopenLink}`} className="text-brand-700 underline">{t('Open a new case')}</Link>}
        </p>
      ) : (
        <form onSubmit={send} className="mt-6">
          <label className="block">
            <span className="sr-only">{t('Reply')}</span>
            <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} maxLength={5000}
              placeholder={t('Write a reply…')} className="w-full rounded border bg-white px-3 py-2" />
          </label>
          <button disabled={busy || !reply.trim()} className="mt-2 rounded bg-brand-600 hover:bg-brand-700 px-5 py-2 text-white disabled:opacity-50">
            {busy ? t('Sending…') : t('Send')}
          </button>
        </form>
      )}
      {actionError && <p role="alert" className="mt-2 text-sm text-red-600">{t(actionError)}</p>}
      <p className="mt-4 text-xs text-gray-500">{t('New replies appear here automatically and are also sent by email.')}</p>
    </main>
  )
}

// Keyed by id, so moving to another case starts with an empty thread.
export default function SupportCase() {
  const { id } = useParams()
  return <CaseThread key={id} id={id} />
}
