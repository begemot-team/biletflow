import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import AddToCalendar from '../components/AddToCalendar.jsx'
import { categoryColors } from '../utils/categoryColors'
import { useI18n } from '../i18n/i18n.js'

const FULL = { dateStyle: 'full', timeStyle: 'short' }
const STATUS = { valid: 'Valid', checked_in: 'Checked in', cancelled: 'Cancelled', refunded: 'Refunded' }

// /tickets/:id — the QR to show at the entrance, plus a download.
function Ticket() {
  const { t, date } = useI18n()
  const { id } = useParams()
  const [ticket, setTicket] = useState(null)
  const [event, setEvent] = useState(undefined) // null = no longer public
  const [typeName, setTypeName] = useState(null)
  const [qrUrl, setQrUrl] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    let objectUrl = null
    let pdfObjectUrl = null
    api(`/tickets/${id}`)
      .then((data) => {
        if (!active) return
        setTicket(data)
        api(`/events/${data.event}`).then((ev) => active && setEvent(ev)).catch(() => active && setEvent(null))
        api(`/events/${data.event}/ticket-types`)
          .then((types) => active && setTypeName(types.results.find((type) => type.id === data.ticket_type)?.name ?? null))
          .catch(() => {})
      })
      .catch((err) => active && setError(err.status === 404 ? 'Ticket not found.' : err.message))
    // The QR endpoint needs the Bearer header, which a plain <img src> cannot send.
    api(`/tickets/${id}/qr`, { as: 'blob' })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        if (active) setQrUrl(objectUrl)
        else URL.revokeObjectURL(objectUrl)
      })
      .catch(() => {})
    api(`/tickets/${id}/pdf`, { as: 'blob' })
      .then((blob) => {
        pdfObjectUrl = URL.createObjectURL(blob)
        if (active) setPdfUrl(pdfObjectUrl)
        else URL.revokeObjectURL(pdfObjectUrl)
      })
      .catch(() => {})
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl)
    }
  }, [id])

  if (error) return <p role="alert" className="mx-auto max-w-3xl px-6 py-20">{t(error)}</p>
  if (!ticket) return <p className="mx-auto max-w-3xl px-6 py-20">{t('Loading…')}</p>

  return (
    <main className="mx-auto max-w-md px-6 py-12 text-center">
      <Link to="/account" className="text-sm text-gray-500">← {t('My Tickets')}</Link>
      <article className="mt-4 overflow-hidden rounded-2xl border bg-white pb-6 shadow-sm">
        {/* Ticket stub in the category color, torn off along a dashed line */}
        <header className={`border-b-2 border-dashed border-white p-6 text-white ${categoryColors(event?.category).solid}`}>
          <h1 className="text-2xl font-bold text-balance wrap-anywhere">
            {event ? event.title : event === null ? t('Event details are no longer public') : t('Ticket')}
          </h1>
          {event && (
            <>
              <p className="mt-1">{date(event.starts_at, FULL)}</p>
              <p>{event.venue}</p>
            </>
          )}
        </header>
        <div className="px-6 pt-4">
          {event && (event.cancelled_at
            ? <p role="status" className="text-amber-800">{t('This event has been cancelled.')}</p>
            : <AddToCalendar event={event} className="justify-center" />)}
          <p className="mt-3">
            {typeName ?? t('Ticket')} · #{ticket.id} ·{' '}
            <span className={`rounded px-2 py-0.5 text-sm ${ticket.status === 'valid' ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'}`}>
              {t(STATUS[ticket.status] ?? ticket.status)}
            </span>
          </p>
          {ticket.attendee_name && <p className="mt-1 text-gray-700">{t('Holder: {name}', { name: ticket.attendee_name })}</p>}
          {qrUrl ? (
            <img src={qrUrl} alt={t('QR code for ticket {id}', { id: ticket.id })} className="mx-auto mt-4 h-64 w-64" />
          ) : (
            <p className="mt-4 text-gray-600">{t('Loading QR code…')}</p>
          )}
          <p className="mt-2 break-all font-mono text-xs text-gray-500">{ticket.identifier}</p>
          {ticket.checked_in_at && (
            <p className="mt-2 text-sm">{t('Checked in: {date}', { date: date(ticket.checked_in_at, FULL) })}</p>
          )}
        </div>
      </article>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {qrUrl && (
          <a href={qrUrl} download={`biletflow-ticket-${ticket.id}.svg`}
            className="rounded bg-brand-600 hover:bg-brand-700 px-5 py-2 text-white">
            {t('Download QR')}
          </a>
        )}
        {pdfUrl && (
          <a href={pdfUrl} download={`biletflow-ticket-${ticket.id}.pdf`}
            className="rounded bg-sun-400 px-5 py-2 text-brand-900 hover:bg-sun-300">
            {t('Download printable PDF')}
          </a>
        )}
      </div>
      <p className="mt-6 text-sm">
        <Link to={`/support/new?ticket=${ticket.id}`} className="text-brand-700 underline">
          {t('Problem with this ticket? Contact the organizer')}
        </Link>
      </p>
    </main>
  )
}

export default Ticket
