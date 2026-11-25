import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import EventOrders from '../components/EventOrders'
import { eventStatus, statusLabel } from '../utils/eventHistory.js'
import { formatAmount, formatMoney } from '../utils/money'
import { ticketsSold } from '../utils/sales'
import { useI18n } from '../i18n/i18n.js'

const SHORT = { dateStyle: 'medium', timeStyle: 'short' }

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  )
}

// /organizer/events/:id — sales summary of one event (GET /events/{id}/sales).
function EventSales() {
  const { t, date } = useI18n()
  const { id } = useParams()
  const [event, setEvent] = useState(null)
  const [sales, setSales] = useState(null)
  const [activation, setActivation] = useState(null)
  const [error, setError] = useState(null)
  const [cancelError, setCancelError] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [version, setVersion] = useState(0) // bumped after a refund or cancellation

  useEffect(() => {
    let active = true
    Promise.all([api(`/events/${id}`), api(`/events/${id}/sales`)])
      .then(([ev, summary]) => {
        if (!active) return
        setEvent(ev)
        setSales(summary)
      })
      .catch((err) => active && setError(err.status === 404 ? 'Event not found.' : err.message))
    api(`/events/${id}/activation`)
      .then((state) => active && setActivation(state))
      .catch(() => {}) // the banner is optional
    return () => { active = false }
  }, [id, version])

  async function cancelEvent() {
    if (!window.confirm(t('Cancel this event? Sales will close and unused tickets will be invalidated. Eligible paid orders can be refunded from this page.'))) return
    setCancelling(true)
    setCancelError('')
    try {
      setEvent(await api(`/events/${id}/cancel`, { method: 'POST' }))
      setVersion((value) => value + 1)
    } catch (failure) {
      setCancelError(failure.message)
    } finally {
      setCancelling(false)
    }
  }

  if (error) return <p role="alert" className="text-red-600">{t(error)}</p>
  if (!sales) return <p>{t('Loading…')}</p>

  const cancelled = Boolean(event.cancelled_at)

  return (
    <main>
      <Link to="/organizer" className="text-sm text-gray-500">← {t('Overview')}</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{event.title}</h1>
          <p className="text-gray-600">
            {date(event.starts_at, SHORT)} · {event.venue} · {t(statusLabel(eventStatus(event)))}
          </p>
        </div>
        <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {!cancelled && <Link to={`/organizer/events/${id}/edit`} className="text-brand-700 underline">{t('Edit & tickets')}</Link>}
          <Link to={`/organizer/events/${id}/staff`} className="text-brand-700 underline">{t('Event Admins')}</Link>
          {!cancelled && <Link to={`/organizer/events/${id}/activation`} className="text-brand-700 underline">{t('Paid sales')}</Link>}
          <Link to={`/organizer/analytics?event=${id}`} className="text-brand-700 underline">{t('Analytics')}</Link>
          {event.published && <Link to={`/events/${id}`} className="text-brand-700 underline">{t('Public page')}</Link>}
          {!cancelled && new Date(event.ends_at) > new Date() && (
            <button type="button" disabled={cancelling} onClick={cancelEvent}
              className="text-red-700 underline disabled:opacity-50">
              {cancelling ? t('Cancelling…') : t('Cancel event')}
            </button>
          )}
        </span>
      </div>

      {cancelError && <p className="mt-4 text-red-700" role="alert">{t(cancelError)}</p>}
      {cancelled && <p className="mt-4 rounded-xl border bg-amber-50 p-4" role="status">{t('Event cancelled. Sales are closed. Eligible paid orders can be refunded below.')}</p>}
      {!cancelled && activation && activation.checklist.some((item) => item.step === 'paid_ticket_type' && item.done) && activation.status !== 'active' && (
        <p role="status" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
          {activation.status === 'suspended'
            ? t('Paid sales for this event are suspended by a platform admin.')
            : t('Paid tickets cannot be bought until paid sales are activated.')}{' '}
          <Link to={`/organizer/events/${id}/activation`} className="text-brand-700 underline">{t('Open the checklist')}</Link>
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('Tickets sold')} value={`${ticketsSold(sales)} / ${event.capacity}`} />
        <Stat label={t('Paid orders')} value={sales.paid_orders} />
        <Stat label={t('Free registrations')} value={sales.free_registrations} />
        <Stat label={t('Refunded orders')} value={sales.refunded_orders} />
        <Stat label={t('Gross sales')} value={formatAmount(sales.gross_minor)} />
        <Stat label={t('Promo discounts')} value={formatAmount(sales.discounts_minor)} />
        <Stat label={t('Refunds')} value={formatAmount(sales.refunds_minor)} />
        <Stat label={t('Processing fees ({percent}%)', { percent: sales.processing_fee_bps / 100 })} value={formatAmount(sales.fees_minor)} />
      </div>
      <p className="mt-4 rounded-xl border border-green-300 bg-green-50 p-4">
        {t('Estimated payout')}: <strong>{formatAmount(sales.estimated_payout_minor)}</strong>
        <span className="block text-xs text-gray-600">{t('Simulated payments. Gross − refunds − fees; gross is after promo discounts.')}</span>
      </p>

      <h2 className="mt-8 text-xl font-semibold">{t('By ticket type')}</h2>
      {sales.ticket_types.length === 0 ? (
        <p className="mt-2 text-gray-600">
          {t('No ticket types yet.')} {!cancelled && <Link to={`/organizer/events/${id}/edit`} className="text-brand-700 underline">{t('Add one')}</Link>}
        </p>
      ) : (
        <div className="relative mt-3 overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-brand-50 text-brand-800">
              <tr>
                <th className="p-3 font-medium">{t('Type')}</th>
                <th className="p-3 text-right font-medium">{t('Price')}</th>
                <th className="p-3 text-right font-medium">{t('Sold / quantity')}</th>
                <th className="p-3 text-right font-medium">{t('Reserved')}</th>
                <th className="p-3 text-right font-medium">{t('Available')}</th>
                <th className="p-3 text-right font-medium">{t('Checked in::count')}</th>
                <th className="p-3 text-right font-medium">{t('Refunded::count')}</th>
                <th className="p-3 text-right font-medium">{t('Sales before discount')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sales.ticket_types.map((type) => (
                <tr key={type.ticket_type}>
                  <td className="p-3">{type.name}</td>
                  <td className="p-3 text-right">{t(formatMoney(type.price_minor))}</td>
                  <td className="p-3 text-right">{type.sold} / {type.quantity}</td>
                  <td className="p-3 text-right">{type.reserved}</td>
                  <td className="p-3 text-right">{type.available}</td>
                  <td className="p-3 text-right">{type.checked_in}</td>
                  <td className="p-3 text-right">{type.refunded}</td>
                  <td className="p-3 text-right">{formatAmount(type.sales_before_discount_minor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EventOrders key={`${id}:${cancelled}`} eventId={id} onChanged={() => setVersion((v) => v + 1)} />
    </main>
  )
}

export default EventSales
