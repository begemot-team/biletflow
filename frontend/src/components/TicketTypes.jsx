import { useEffect, useState } from 'react'
import { api, fieldErrors } from '../api/client'
import { formatMoney, parseTenge } from '../utils/money'
import { useI18n } from '../i18n/i18n.js'

const empty = { name: '', price: '0', quantity: '100', max_per_order: '10' }

function Input({ label, error, ...props }) {
  return (
    <label className="block">
      <span className="text-sm">{label}</span>
      <input {...props} aria-invalid={Boolean(error)}
        className="mt-1 w-full rounded border bg-white px-3 py-2 focus:outline-2 focus:outline-brand-500" />
      {error && <span className="mt-1 block text-sm text-red-600">{error}</span>}
    </label>
  )
}

// Organizer-side ticket types ("tariffs") of one event: list, add, hide/show.
export default function TicketTypes({ eventId }) {
  const { t } = useI18n()
  const [types, setTypes] = useState(null)
  const [form, setForm] = useState(empty)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    api(`/events/${eventId}/ticket-types`)
      .then((data) => active && setTypes(data.results))
      .catch((err) => active && setErrors({ form: err.message }))
    return () => { active = false }
  }, [eventId])

  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  async function add(e) {
    e.preventDefault()
    const price = parseTenge(form.price)
    if (price === null) {
      setErrors({ price: 'Enter a price in tenge, e.g. 2500 or 2500.50' })
      return
    }
    setBusy(true)
    setErrors({})
    try {
      const created = await api(`/events/${eventId}/ticket-types`, {
        method: 'POST',
        body: {
          name: form.name,
          price_minor: price,
          quantity: Number(form.quantity),
          max_per_order: Number(form.max_per_order),
        },
      })
      setTypes([...(types ?? []), created])
      setForm(empty)
    } catch (err) {
      const errs = fieldErrors(err)
      setErrors({ ...errs, price: errs.price_minor, form: errs.detail ?? errs.non_field_errors })
    } finally {
      setBusy(false)
    }
  }

  async function setHidden(type, hidden) {
    setBusy(true)
    setErrors({})
    try {
      const updated = await api(`/ticket-types/${type.id}`, { method: 'PATCH', body: { hidden } })
      setTypes(types.map((item) => (item.id === type.id ? updated : item)))
    } catch (err) {
      setErrors({ form: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-8" aria-labelledby="ticket-types-title">
      <h3 id="ticket-types-title" className="text-xl font-semibold">{t('Ticket types')}</h3>
      {types === null && !errors.form && <p className="mt-2 text-gray-600">{t('Loading…')}</p>}
      {types?.length === 0 && (
        <p className="mt-2 text-gray-600">{t('No ticket types yet. Attendees can buy tickets once you add one.')}</p>
      )}
      {types?.length > 0 && (
        <ul className="mt-3 divide-y rounded-xl border bg-white">
          {types.map((type) => (
            <li key={type.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <span>
                <strong>{type.name}</strong>
                {type.hidden && <span className="ml-2 rounded bg-gray-200 px-2 py-0.5 text-xs">{t('Hidden')}</span>}
                <span className="block text-sm text-gray-600">
                  {t(formatMoney(type.price_minor))}
                  {' · '}
                  {t('{left} of {quantity} left · max {max} per order', { left: type.available, quantity: type.quantity, max: type.max_per_order })}
                </span>
              </span>
              <button type="button" disabled={busy} onClick={() => setHidden(type, !type.hidden)}
                className="rounded border px-3 py-1 text-sm disabled:opacity-50">
                {type.hidden ? t('Show') : t('Hide from sale')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="mt-4 space-y-3 rounded-lg border border-brand-200 bg-brand-50 p-4" noValidate>
        <p className="font-medium">{t('Add a ticket type')}</p>
        <Input label={t('Name::ticket')} name="name" required maxLength={120} placeholder={t('Standard')}
          value={form.name} onChange={update} error={t(errors.name)} />
        <div className="grid grid-cols-3 gap-3">
          <Input label={t('Price, ₸ (0 = free)')} name="price" inputMode="decimal" required
            value={form.price} onChange={update} error={t(errors.price)} />
          <Input label={t('Quantity')} name="quantity" type="number" min="0" max="1000000" required
            value={form.quantity} onChange={update} error={t(errors.quantity)} />
          <Input label={t('Max per order')} name="max_per_order" type="number" min="1" max="100" required
            value={form.max_per_order} onChange={update} error={t(errors.max_per_order)} />
        </div>
        {errors.form && <p role="alert" className="text-sm text-red-600">{t(errors.form)}</p>}
        <button disabled={busy} className="rounded bg-brand-600 hover:bg-brand-700 px-5 py-2 text-white disabled:opacity-50">
          {t('Add ticket type')}
        </button>
      </form>
    </section>
  )
}
