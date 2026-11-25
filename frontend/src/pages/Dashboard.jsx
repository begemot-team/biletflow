import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { formatAmount } from '../utils/money'
import { publicationLabel } from '../utils/eventHistory.js'
import { dashboardTotals, ticketsSold } from '../utils/sales'
import { useI18n } from '../i18n/i18n.js'

const DAY = { dateStyle: 'medium' }

function Stat({ label, value, color }) {
  return (
    <div className={`rounded-xl p-4 ${color}`}>
      <p className="text-sm">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  )
}

// /organizer — every event with its sales at a glance (GET /me/events, then
// GET /events/{id}/sales per event on the first page).
function Dashboard() {
  const { t, date } = useI18n()
  const [events, setEvents] = useState(null)
  const [sales, setSales] = useState({}) // event id -> sales summary
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    api('/me/events')
      .then((page) => {
        if (!active) return
        setEvents(page.results)
        for (const ev of page.results) {
          api(`/events/${ev.id}/sales`)
            .then((summary) => active && setSales((known) => ({ ...known, [ev.id]: summary })))
            .catch(() => {}) // that row shows "—"
        }
      })
      .catch((err) => active && setError(err.message))
    return () => { active = false }
  }, [])

  if (error) return <p role="alert" className="text-red-600">{t(error)}</p>
  if (events === null) return <p>{t('Loading…')}</p>

  const totals = dashboardTotals(events, sales)

  return (
    <main>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{t('Overview')}</h1>
        <Link to="/organizer/events/new" className="rounded bg-brand-600 hover:bg-brand-700 px-4 py-2 text-white">{t('Create event')}</Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat color="bg-brand-100 text-brand-900" label={t('Events (published)')} value={`${totals.events} (${totals.published})`} />
        <Stat color="bg-brand-50 text-brand-900" label={t('Tickets sold')} value={totals.sold} />
        <Stat color="bg-sun-100 text-brand-900" label={t('Gross sales')} value={formatAmount(totals.gross)} />
        <Stat color="bg-cat-sports/12 text-brand-900" label={t('Estimated payout')} value={formatAmount(totals.payout)} />
      </div>
      <p className="mt-2 text-xs text-gray-500">{t('Payments are simulated. Payout = gross − refunds − processing fees.')}</p>

      {events.length === 0 ? (
        <p className="mt-8 text-gray-600">
          {t('You have no events yet.')} <Link to="/organizer/events/new" className="text-brand-700 underline">{t('Create one')}</Link>
        </p>
      ) : (
        <div className="relative mt-8 overflow-x-auto rounded-xl border bg-white">
          {/* relative: keeps the absolutely positioned sr-only header inside this scroll box on phones */}
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-brand-50 text-brand-800">
              <tr>
                <th className="p-3 font-medium">{t('Event')}</th>
                <th className="p-3 font-medium">{t('Date')}</th>
                <th className="p-3 text-right font-medium">{t('Sold / capacity')}</th>
                <th className="p-3 text-right font-medium">{t('Gross')}</th>
                <th className="p-3 font-medium"><span className="sr-only">{t('Actions')}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {events.map((ev) => {
                const summary = sales[ev.id]
                return (
                  <tr key={ev.id}>
                    <td className="p-3">
                      <strong>{ev.title}</strong>
                      <span className={`ml-2 rounded px-2 py-0.5 text-xs ${ev.published && !ev.cancelled_at ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'}`}>
                        {t(publicationLabel(ev))}
                      </span>
                    </td>
                    <td className="whitespace-nowrap p-3">{date(ev.starts_at, DAY)}</td>
                    <td className="p-3 text-right">{summary ? `${ticketsSold(summary)} / ${ev.capacity}` : '—'}</td>
                    <td className="p-3 text-right">{summary ? formatAmount(summary.gross_minor) : '—'}</td>
                    <td className="whitespace-nowrap p-3 text-right">
                      <Link to={`/organizer/events/${ev.id}`} className="text-brand-700 underline">{t('Sales')}</Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

export default Dashboard
