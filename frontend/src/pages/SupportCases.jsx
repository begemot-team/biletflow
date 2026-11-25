import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/auth'
import { ATTENDEE_CATEGORIES, PLATFORM_CATEGORIES, STATUSES, isSupportSide, statusLabel } from '../utils/support'
import { useI18n } from '../i18n/i18n.js'

const SHORT = { dateStyle: 'medium', timeStyle: 'short' }

// /support — cases the user opened, plus (for organizers) cases about their
// events. GET /support-cases?status=, newest activity first.
function SupportCases() {
  const { t, date } = useI18n()
  const { user } = useAuth()
  const [status, setStatus] = useState('')
  const [cases, setCases] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    api(`/support-cases${status ? `?status=${status}` : ''}`)
      .then((page) => {
        if (!active) return
        setCases(page.results)
        setError(null)
      })
      .catch((err) => active && setError(err.status === 404 ? 'Support is not available on this server yet.' : err.message))
    return () => { active = false }
  }, [status])

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{t('Support')}</h1>
        <Link to="/support/new" className="rounded bg-brand-600 hover:bg-brand-700 px-4 py-2 text-white">{t('New case')}</Link>
      </div>
      <label className="mt-6 block text-sm">
        {t('Status')}{' '}
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="ml-2 rounded border bg-white px-2 py-1">
          <option value="">{t('All')}</option>
          {Object.entries(STATUSES).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
        </select>
      </label>

      {error && <p role="alert" className="mt-6 text-red-600">{t(error)}</p>}
      {cases === null && !error && <p className="mt-6">{t('Loading…')}</p>}
      {cases?.length === 0 && (
        <p className="mt-6 text-gray-600">
          {status ? t('No cases with this status.') : t('No cases.')} {t('Need help with a ticket? Open it from')}{' '}
          <Link to="/account" className="text-brand-700 underline">{t('My Tickets')}</Link>.
        </p>
      )}
      {cases?.length > 0 && (
        <ul className="mt-6 divide-y rounded-xl border bg-white">
          {cases.map((c) => (
            <li key={c.id}>
              <Link to={`/support/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-gray-50">
                <span>
                  <strong>{c.subject}</strong>
                  <span className="block text-sm text-gray-600">
                    #{c.id} · {t((c.kind === 'platform' ? PLATFORM_CATEGORIES : ATTENDEE_CATEGORIES)[c.category] ?? c.category)}
                    {isSupportSide(c, user) && ` · ${t('from {email}', { email: c.requester_email })}`} · {date(c.updated_at, SHORT)}
                  </span>
                </span>
                <span className={`rounded px-2 py-0.5 text-xs ${c.status === 'resolved' ? 'bg-gray-200 text-gray-700' : 'bg-amber-100 text-amber-800'}`}>
                  {t(statusLabel(c.status, isSupportSide(c, user)))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

export default SupportCases
