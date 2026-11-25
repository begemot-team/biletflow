import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, session } from '../api/client'
import { useAuth } from '../auth/auth'
import { formatMoney } from '../utils/money'
import { ORDER_STATUS, attendeeCanCancel } from '../utils/orders'
import { useI18n } from '../i18n/i18n.js'

const SHORT = { dateStyle: 'medium', timeStyle: 'short' }

const TICKET_STATUS = { valid: 'Valid', checked_in: 'Checked in', cancelled: 'Cancelled', refunded: 'Refunded' }

// /account — the attendee's tickets and orders (first page of each).

function Account() {
  const { t, date } = useI18n()
  const { user } = useAuth()
  const [tickets, setTickets] = useState(null)
  const [orders, setOrders] = useState(null)
  const [events, setEvents] = useState({}) // event id -> title
  const [error, setError] = useState(null)
  const [confirming, setConfirming] = useState(null) // order id awaiting the second click
  const [orderError, setOrderError] = useState(null)
  const [version, setVersion] = useState(0)
  const [sendingVerification, setSendingVerification] = useState(false)
  const [verificationNotice, setVerificationNotice] = useState(null)

  useEffect(() => {
    let active = true
    Promise.all([api('/me/tickets'), api('/me/orders')])
      .then(([ticketPage, orderPage]) => {
        if (!active) return
        setTickets(ticketPage.results)
        setOrders(orderPage.results)
        const ids = new Set([...ticketPage.results, ...orderPage.results].map((x) => x.event))
        for (const eventId of ids) {
          api(`/events/${eventId}`)
            .then((ev) => active && setEvents((known) => ({ ...known, [eventId]: ev.title })))
            .catch(() => {})
        }
      })
      .catch((err) => active && setError(err.message))
    return () => { active = false }
  }, [version])

  async function cancelRegistration(order) {
    setOrderError(null)
    try {
      await api(`/orders/${order.id}/cancel`, { method: 'POST' })
      setConfirming(null)
      setVersion((v) => v + 1) // tickets change status too
    } catch (err) {
      setOrderError(err.message)
      setConfirming(null)
    }
  }

  async function resendVerification() {
    setSendingVerification(true)
    setVerificationNotice(null)
    try {
      await api('/auth/verify-email/request', { method: 'POST' })
      setVerificationNotice({ message: 'Check your inbox for a new confirmation link.' })
      await session.restore().catch(() => {})
    } catch (failure) {
      setVerificationNotice({ error: true, message: failure.message })
    } finally {
      setSendingVerification(false)
    }
  }

  const title = (eventId) => events[eventId] ?? t('Event #{id}', { id: eventId })
  const pending = orders?.filter((o) => o.status === 'pending') ?? []

  if (error) return <p role="alert" className="mx-auto max-w-3xl px-6 py-20">{t(error)}</p>
  if (tickets === null) return <p className="mx-auto max-w-3xl px-6 py-20">{t('Loading…')}</p>

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold">{t('My Tickets')}</h1>

      {user?.email_verified === false && (
        <section className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <h2 className="font-semibold">{t('Verify your email')}</h2>
          <p className="mt-1 text-sm">{t('Open the confirmation link sent to {email}.', { email: user.email })}</p>
          <button type="button" onClick={resendVerification} disabled={sendingVerification}
            className="mt-2 text-brand-700 underline disabled:opacity-50">
            {sendingVerification ? t('Requesting…') : t('Send another link')}
          </button>
          {verificationNotice && <p role={verificationNotice.error ? 'alert' : 'status'} className="mt-2 text-sm">
            {t(verificationNotice.message)}
          </p>}
        </section>
      )}

      {pending.length > 0 && (
        <section className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <h2 className="font-semibold">{t('Unfinished orders')}</h2>
          <ul className="mt-2 space-y-1">
            {pending.map((o) => (
              <li key={o.id}>
                {title(o.event)} · {t('reserved until {date}', { date: date(o.expires_at, SHORT) })} ·{' '}
                <Link to={`/checkout/${o.id}`} className="text-brand-700 underline">{t('Continue checkout')}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tickets.length === 0 ? (
        <p className="mt-6 text-gray-600">
          {t('You have no tickets yet.')} <Link to="/" className="text-brand-700 underline">{t('Find an event')}</Link>
        </p>
      ) : (
        <ul className="mt-6 divide-y rounded-xl border bg-white">
          {tickets.map((ticket) => (
            <li key={ticket.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <span>
                <strong>{title(ticket.event)}</strong>
                <span className="block text-sm text-gray-600">
                  {t('Ticket #{id}', { id: ticket.id })} ·{' '}
                  <span className={`rounded px-2 py-0.5 text-xs ${ticket.status === 'valid' ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'}`}>
                    {t(TICKET_STATUS[ticket.status] ?? ticket.status)}
                  </span>
                </span>
              </span>
              <Link to={`/tickets/${ticket.id}`} className="text-brand-700 underline">{t('Show QR')}</Link>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-10 text-xl font-semibold">{t('Orders')}</h2>
      {orderError && <p role="alert" className="mt-2 text-red-600">{t(orderError)}</p>}
      {orders.length === 0 ? <p className="mt-2 text-gray-600">{t('No orders yet.')}</p> : (
        <ul className="mt-3 divide-y rounded-xl border bg-white text-sm">
          {orders.map((o) => (
            <li key={o.id} className="flex flex-wrap justify-between gap-2 p-3">
              <span>#{o.id} · {title(o.event)} · {date(o.created_at, SHORT)}</span>
              <span>
                {t(ORDER_STATUS[o.status] ?? o.status)} · {t(formatMoney(o.total_minor))}
                {o.status !== 'pending' && (
                  <>
                    {' · '}
                    <Link to={`/support/new?order=${o.id}`} className="text-brand-700 underline">{t('Get help')}</Link>
                  </>
                )}
                {attendeeCanCancel(o) && (
                  confirming === o.id ? (
                    <>
                      {' · '}
                      <button type="button" onClick={() => cancelRegistration(o)} className="text-red-700 underline">
                        {t('Yes, cancel and free my seat')}
                      </button>
                      {' · '}
                      <button type="button" onClick={() => setConfirming(null)} className="underline">{t('Keep')}</button>
                    </>
                  ) : (
                    <>
                      {' · '}
                      <button type="button" onClick={() => setConfirming(o.id)} className="text-red-700 underline">
                        {t('Cancel registration')}
                      </button>
                    </>
                  )
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

export default Account
