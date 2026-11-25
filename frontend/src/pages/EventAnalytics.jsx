import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client.js'
import { allPages } from '../api/pages.js'
import { analyticsQuery, chartRows, datePreset, reconciliation } from '../utils/analytics.js'
import { formatAmount, formatMoney } from '../utils/money.js'
import { useI18n } from '../i18n/i18n.js'
import { formatDayMonth } from '../i18n/translate.js'

const SHORT = { dateStyle: 'medium', timeStyle: 'short' }

// "2026-12-04" from the report is a calendar day, so it is never shifted to the viewer's zone.
function dayLabel(language, day) {
  const { day: number, month } = formatDayMonth(language, `${day}T00:00:00Z`, 'UTC')
  return `${number} ${month}`
}

function Stat({ label, value, detail }) {
  return (
    <section className="rounded-xl border bg-white p-4">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {detail && <p className="mt-1 text-xs text-gray-500">{detail}</p>}
    </section>
  )
}

function MoneyTable({ rows, kind }) {
  const { t } = useI18n()
  if (!rows.length) return <p className="mt-3 text-gray-600">{kind === 'campaign' ? t('No campaign data for this period.') : t('No ticket data for this period.')}</p>
  return (
    <div className="relative mt-3 overflow-x-auto rounded-xl border bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-brand-50 text-brand-800">
          <tr>
            <th className="p-3 font-medium">{kind === 'campaign' ? t('Campaign') : t('Ticket type')}</th>
            <th className="p-3 text-right font-medium">{t('Issued')}</th>
            {kind === 'campaign' && <th className="p-3 text-right font-medium">{t('Redemptions')}</th>}
            <th className="p-3 text-right font-medium">{t('Collected')}</th>
            <th className="p-3 text-right font-medium">{t('Discount')}</th>
            <th className="p-3 text-right font-medium">{t('Refunded::count')}</th>
            <th className="p-3 text-right font-medium">{t('Net receipts')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="p-3">
                <strong>{row.name}</strong>
                {kind === 'ticket' && <span className="block text-xs text-gray-500">{t(formatMoney(row.price_minor))}</span>}
              </td>
              <td className="p-3 text-right">{row.issued_tickets}</td>
              {kind === 'campaign' && <td className="p-3 text-right">{row.redemptions}</td>}
              <td className="p-3 text-right">{formatAmount(row.collected_minor)}</td>
              <td className="p-3 text-right">{formatAmount(row.discount_minor)}</td>
              <td className="p-3 text-right">{formatAmount(row.refunded_minor)}</td>
              <td className="p-3 text-right">{formatAmount(row.net_receipts_minor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function EventAnalytics() {
  const { language, t, date } = useI18n()
  const [requestedEvent] = useState(() => new URLSearchParams(window.location.search).get('event'))
  const [events, setEvents] = useState(null)
  const [eventId, setEventId] = useState('')
  const [ticketTypes, setTicketTypes] = useState([])
  const [filters, setFilters] = useState({ from: '', to: '', ticketType: '' })
  const [query, setQuery] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [analytics, setAnalytics] = useState(null)
  const [error, setError] = useState('')
  const [filterError, setFilterError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true
    allPages('/me/events').then((items) => {
      if (!active) return
      setEvents(items)
      if (items.length) {
        setLoading(true)
        const requested = items.find((item) => String(item.id) === requestedEvent)
        setEventId(String(requested?.id ?? items[0].id))
      }
    }).catch((failure) => active && setError(failure.message))
    return () => { active = false }
  }, [requestedEvent])

  useEffect(() => {
    if (!eventId) return
    let active = true
    allPages(`/events/${eventId}/ticket-types`)
      .then((items) => active && setTicketTypes(items))
      .catch(() => {})
    return () => { active = false }
  }, [eventId])

  useEffect(() => {
    if (!eventId) return
    let active = true
    api(`/events/${eventId}/analytics${query}`)
      .then((data) => active && setAnalytics(data))
      .catch((failure) => active && setError(failure.message))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [eventId, query, refresh])

  function apply(event) {
    event.preventDefault()
    try {
      setFilterError('')
      setError('')
      setLoading(true)
      setQuery(analyticsQuery(filters))
      setRefresh((value) => value + 1)
    } catch (failure) {
      setFilterError(failure.message)
    }
  }

  function preset(days) {
    const dates = datePreset(days)
    const next = { ...filters, ...dates }
    setFilters(next)
    setFilterError('')
    setError('')
    setLoading(true)
    setQuery(analyticsQuery(next))
    setRefresh((value) => value + 1)
  }

  function allTime() {
    const next = { ...filters, from: '', to: '' }
    setFilters(next)
    setFilterError('')
    setError('')
    setLoading(true)
    setQuery(analyticsQuery(next))
    setRefresh((value) => value + 1)
  }

  if (events === null && !error) return <p>{t('Loading analytics…')}</p>
  if (events?.length === 0) return <p>{t('You need an event before analytics can be displayed.')}</p>

  const current = events?.find((item) => String(item.id) === eventId)
  const rows = chartRows(analytics?.daily)
  const inventory = analytics?.inventory
  const totals = analytics?.totals

  return (
    <main>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{t('Analytics')}</h1>
          <p className="mt-1 text-gray-600">{t('Real sales, inventory, campaign and check-in data from the backend.')}</p>
        </div>
        {current && <Link to={`/organizer/events/${eventId}`} className="text-brand-700 underline">{t('Open event sales')}</Link>}
      </div>

      <form onSubmit={apply} className="mt-6 rounded-xl border bg-white p-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-medium">{t('Event')}
            <select className="mt-1 block w-full rounded border p-2" value={eventId} onChange={(event) => { setTicketTypes([]); setAnalytics(null); setError(''); setLoading(true); setEventId(event.target.value); setFilters((value) => ({ ...value, ticketType: '' })); setQuery('') }}>
              {events?.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">{t('From (inclusive)')}
            <input className="mt-1 block w-full rounded border p-2" type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} />
          </label>
          <label className="text-sm font-medium">{t('To (exclusive)')}
            <input className="mt-1 block w-full rounded border p-2" type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} />
          </label>
          <label className="text-sm font-medium">{t('Ticket type')}
            <select className="mt-1 block w-full rounded border p-2" value={filters.ticketType} onChange={(event) => setFilters({ ...filters, ticketType: event.target.value })}>
              <option value="">{t('All ticket types')}</option>
              {ticketTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="submit" className="rounded bg-brand-600 hover:bg-brand-700 px-4 py-2 text-white">{t('Apply filters')}</button>
          <button type="button" className="rounded border px-3 py-2" onClick={() => preset(7)}>{t('Last 7 days')}</button>
          <button type="button" className="rounded border px-3 py-2" onClick={() => preset(30)}>{t('Last 30 days')}</button>
          <button type="button" className="rounded border px-3 py-2" onClick={allTime}>{t('All time')}</button>
        </div>
        {filterError && <p role="alert" className="mt-3 text-sm text-red-600">{t(filterError)}</p>}
      </form>

      {error && <p role="alert" className="mt-6 rounded border border-red-300 bg-red-50 p-4 text-red-700">{t(error)}</p>}
      {loading && <p className="mt-6" role="status">{t('Loading report…')}</p>}

      {!loading && analytics && (
        <>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-xl font-semibold">{current?.title}</h2>
            <p className="text-xs text-gray-500">{t('Inventory as of {date}', { date: date(analytics.as_of, SHORT) })} · {analytics.timezone}</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t('Event capacity')} value={inventory.capacity} detail={t('Whole-event capacity')} />
            <Stat label={t('Active tickets')} value={inventory.active_tickets} detail={t('{count} currently reserved', { count: inventory.reserved_tickets })} />
            <Stat label={t('Remaining')} value={inventory.remaining} detail={t('Current sellable inventory')} />
            <Stat label={t('Check-in')} value={`${inventory.check_in_percent}%`} detail={t('{count} of {total} active tickets', { count: inventory.checked_in, total: inventory.active_tickets })} />
            <Stat label={t('Sales before discount')} value={formatAmount(totals.sales_before_discount_minor)} />
            <Stat label={t('Discounts')} value={formatAmount(totals.discount_minor)} />
            <Stat label={t('Collected')} value={formatAmount(totals.collected_minor)} />
            <Stat label={t('Refunded::count')} value={formatAmount(totals.refunded_minor)} />
            <Stat label={t('Net receipts')} value={formatAmount(totals.net_receipts_minor)} detail={t('Collected − refunds, before fees')} />
            <Stat label={t('Processing fees')} value={formatAmount(totals.fees_minor)} />
            <Stat label={t('Issued tickets')} value={totals.issued_tickets} detail={t('Historical confirmations in this period')} />
            <Stat label={t('Estimated payout')} value={formatAmount(totals.net_receipts_minor - totals.fees_minor)} detail={t('Net receipts − fees')} />
          </div>
          {inventory.ticket_type && (
            <p className="mt-3 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm">
              <strong>{inventory.ticket_type.name}:</strong> {t('{active} active, {remaining} of {quantity} remaining. Event capacity remains {capacity}.', { active: inventory.ticket_type.active_tickets, remaining: inventory.ticket_type.type_remaining, quantity: inventory.ticket_type.quantity, capacity: inventory.capacity })}
            </p>
          )}
          {!reconciliation(analytics) && <p role="alert" className="mt-3 text-red-600">{t('Daily values do not reconcile with the totals.')}</p>}
          <p className="mt-3 text-xs text-gray-500">{t('All monetary values are simulated KZT amounts; no real payments are processed.')}</p>

          <section className="mt-8">
            <h2 className="text-xl font-semibold">{t('Sales over time')}</h2>
            {rows.length === 0 ? <p className="mt-3 text-gray-600">{t('No confirmed sales or refunds yet.')}</p> : (
              <div className="mt-3 overflow-x-auto rounded-xl border bg-white p-4">
                <div className="min-w-[640px] space-y-2">
                  {rows.map((day) => (
                    <div className="grid grid-cols-[80px_1fr_140px] items-center gap-3 text-sm" key={day.date}>
                      <time dateTime={day.date}>{dayLabel(language, day.date)}</time>
                      <div className="space-y-1" aria-label={t('{collected} collected and {refunded} refunded', { collected: formatAmount(day.collected_minor), refunded: formatAmount(day.refunded_minor) })}>
                        <div className="h-3 rounded bg-emerald-100"><div className="h-3 rounded bg-emerald-600" style={{ width: `${day.collected_percent}%` }} /></div>
                        <div className="h-2 rounded bg-rose-100"><div className="h-2 rounded bg-rose-500" style={{ width: `${day.refunded_percent}%` }} /></div>
                      </div>
                      <span className="text-right text-xs"><strong>{formatAmount(day.collected_minor)}</strong><br /><span className="text-rose-700">− {formatAmount(day.refunded_minor)}</span></span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold">{t('By ticket type')}</h2>
            <MoneyTable rows={analytics.ticket_types} kind="ticket" />
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold">{t('Campaign performance')}</h2>
            <p className="mt-1 text-sm text-gray-600">{t(analytics.campaign_scope)}</p>
            <MoneyTable rows={analytics.campaigns} kind="campaign" />
          </section>
        </>
      )}
    </main>
  )
}
