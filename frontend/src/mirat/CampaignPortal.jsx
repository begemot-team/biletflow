import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/i18n.js'
import { savedLanguage } from '../i18n/savedLanguage.js'
import { campaignPayload, createCampaignApi } from './campaignApi.js'
import './workspace.css'

const money = value => new Intl.NumberFormat('ru-KZ', { style: 'currency', currency: 'KZT' }).format(value / 100)
const SHORT = { dateStyle: 'medium', timeStyle: 'short' }
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
let storage
try { storage = window.sessionStorage } catch { storage = { getItem: () => null, setItem() {}, removeItem() {} } }
const api = createCampaignApi(storage, fetch, savedLanguage)
let initialSession
function restore() {
  // React StrictMode must not rotate the same refresh token twice on mount.
  if (!initialSession) initialSession = api.restore().finally(() => { initialSession = null })
  return initialSession
}

function CampaignQr({ campaign }) {
  const { t } = useI18n()
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  async function show() {
    if (url) { URL.revokeObjectURL(url); setUrl(''); return }
    setLoading(true); setError('')
    try { setUrl(URL.createObjectURL(await api.blob(`/campaigns/${campaign.id}/qr`))) }
    catch (failure) { setError(failure.message) }
    finally { setLoading(false) }
  }
  return <div className="mw-campaign-qr">
    <button type="button" className="mw-secondary" disabled={loading} onClick={show}>{url ? t('Hide QR') : loading ? t('Loading…') : t('Show Campaign QR')}</button>
    {error && <small role="alert">{t(error)}</small>}
    {url && <div className="mw-campaign-qr-card"><strong>{t('CAMPAIGN LINK · NOT AN ENTRY TICKET')}</strong><img src={url} alt={t('Campaign QR for {name}', { name: campaign.name })} /><a className="mw-button" href={url} download={`biletflow-campaign-${campaign.id}.svg`}>{t('Download Campaign QR')}</a><small>{t('Scanning opens the event page and applies the promo code.')}</small></div>}
  </div>
}

function CampaignEditor({ event, onFailure }) {
  const { t, date } = useI18n()
  const [data, setData] = useState(null)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [discountType, setDiscountType] = useState('percent')
  const [created, setCreated] = useState(null)
  const [uncertain, setUncertain] = useState(false)
  const submitting = useRef(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])
  useEffect(() => {
    let active = true
    Promise.all([api.list(`/events/${event.id}/ticket-types`), api.list(`/events/${event.id}/campaigns`)])
      .then(([types, campaigns]) => { if (active) { setData({ types, campaigns }); setError('') } })
      .catch(failure => { if (active) { setError(failure.message); onFailure(failure) } })
      .finally(() => { if (active) setFetching(false) })
    return () => { active = false }
  }, [event.id, reload, onFailure])

  async function submit(e) {
    e.preventDefault()
    if (submitting.current || !data || uncertain || fetching) return
    const form = e.currentTarget
    const fields = new FormData(form)
    let payload
    try { payload = campaignPayload({ ...Object.fromEntries(fields), ticket_types: fields.getAll('ticket_types') }, data.types.map(type => type.id)) }
    catch (failure) { setError(failure.message); return }
    submitting.current = true
    setBusy(true)
    setError('')
    setCreated(null)
    try {
      const result = await api.request(`/events/${event.id}/campaigns`, payload)
      if (!Number.isInteger(result?.id)) throw new Error('Could not confirm that the campaign was created.')
      if (!alive.current) return
      setCreated(result)
      setData(previous => ({ ...previous, campaigns: [result, ...previous.campaigns] }))
      form.reset()
      setDiscountType('percent')
    } catch (failure) {
      if (!alive.current) return
      setError(failure.message)
      // A lost response may follow a successful save; never automatically repeat this POST.
      if (!failure.status || failure.status >= 500 || failure.status < 400) setUncertain(true)
      onFailure(failure)
    } finally {
      submitting.current = false
      if (alive.current) setBusy(false)
    }
  }
  function refreshList() { setFetching(true); setReload(value => value + 1) }
  return <>
    {error && <p className="mw-notice" role="alert">{t(error)}</p>}
    {!data ? <section className="mw-panel">{error ? <button disabled={fetching} onClick={refreshList}>{t('Try loading again')}</button> : <p role="status">{t('Loading tickets and campaigns…')}</p>}</section> : <>
      {created && <section className="mw-panel mw-success" role="status"><h2>{t('Campaign created')}</h2><p>{created.name} · #{created.id}</p><p>{t('Promo code')}: <strong>{created.codes?.map(code => code.code).join(', ') || t('See the campaign list')}</strong></p><p>{t('Discount')}: {created.discount_type === 'percent' ? `${created.discount_value}%` : money(created.discount_value)}</p></section>}
      {uncertain && <section className="mw-panel" role="alert"><h2>{t('Check the result before trying again')}</h2><p>{t('No response from the server. The campaign may have been saved. Refresh the list below and check the name, dates and discount.')}</p><button disabled={fetching} onClick={refreshList}>{t('Refresh the campaign list')}</button><button className="mw-secondary" onClick={() => setUncertain(false)}>{t('I checked the list, allow sending again')}</button></section>}
      <div className="mw-columns"><form className="mw-panel" onSubmit={submit} aria-busy={busy}>
        <h2>{t('New campaign')}</h2><p>{event.title}</p>
        <fieldset disabled={busy || uncertain || fetching} className="mw-fields">
          <label>{t('Campaign name')}<input name="name" required maxLength={120} placeholder={t('Student discount')} /></label>
          <label>{t('Discount type')}<select name="discount_type" value={discountType} onChange={e => setDiscountType(e.target.value)}><option value="percent">{t('Percent')}</option><option value="fixed">{t('Amount in tenge')}</option></select></label>
          <label>{discountType === 'percent' ? t('Discount, %') : t('Discount, ₸')}<input key={discountType} name="discount_value" type="number" required min={discountType === 'percent' ? '1' : '0.01'} max={discountType === 'percent' ? '100' : '10000000'} step={discountType === 'percent' ? '1' : '0.01'} /></label>
          <p>{t('Time zone of the dates')}: <strong>{zone}</strong> ({t('your browser time')}).</p>
          <label>{t('Starts')}<input name="starts_at" type="datetime-local" required /></label>
          <label>{t('Ends')}<input name="ends_at" type="datetime-local" required /></label>
          <label>{t('Maximum redemptions')}<input name="max_redemptions" type="number" min="1" max="2147483647" step="1" placeholder={t('No limit')} /></label>
          <fieldset className="mw-ticket-options"><legend>{t('Applicable ticket types')}</legend><p>{t('Nothing selected means all types, including ones added later.')}</p>{data.types.length ? data.types.map(type => <label className="mw-checkbox" key={type.id}><input type="checkbox" name="ticket_types" value={type.id} />{type.name} · {money(type.price_minor)}{type.hidden ? ` · ${t('hidden')}` : ''}</label>) : <p>{t('This event has no ticket types yet. The campaign will apply to all future types.')}</p>}</fieldset>
          <button type="submit">{busy ? t('Creating…') : t('Create campaign')}</button>
        </fieldset>
      </form><section className="mw-panel"><h2>{t('Campaign terms')}</h2><p>{t('The server issues a promo code after saving. A new campaign is enabled; the dates set when it is valid.')}</p><p>{t('A fixed discount is entered in tenge. The server checks the final discount and limits at checkout.')}</p><p>{t('Switching the event clears the unfinished form.')}</p></section></div>
      <section className="mw-panel"><div className="mw-account"><h2>{t('Saved campaigns')}</h2><button disabled={busy || fetching} onClick={refreshList}>{t('Refresh the list')}</button></div>{data.campaigns.length === 0 ? <p>{t('This event has no campaigns yet.')}</p> : <div className="mw-table"><table><thead><tr><th>{t('Name / ID')}</th><th>{t('Promo code')}</th><th>{t('Discount')}</th><th>{t('Period')}</th><th>{t('Ticket types')}</th><th>{t('Limit')}</th><th>Campaign QR</th></tr></thead><tbody>{data.campaigns.map(campaign => <tr key={campaign.id}><td>{campaign.name} · #{campaign.id}<br />{campaign.enabled ? t('Enabled') : t('Disabled')}</td><td>{campaign.codes.map(code => code.code).join(', ')}</td><td>{campaign.discount_type === 'percent' ? `${campaign.discount_value}%` : money(campaign.discount_value)}</td><td>{campaign.starts_at ? date(campaign.starts_at, SHORT) : t('No start')} — {campaign.ends_at ? date(campaign.ends_at, SHORT) : t('No end')}</td><td>{campaign.ticket_types.length ? campaign.ticket_types.map(id => data.types.find(type => type.id === id)?.name || `#${id}`).join(', ') : t('All')}</td><td>{campaign.max_redemptions ?? t('No limit')}</td><td><CampaignQr campaign={campaign} /></td></tr>)}</tbody></table></div>}</section>
    </>}
  </>
}

export default function CampaignPortal() {
  const { t } = useI18n()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [events, setEvents] = useState(null)
  const [eventId, setEventId] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    restore().then(value => { if (active) setUser(value) }).catch(failure => { if (active) setError(failure.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!user) return
    let active = true
    api.list('/me/events').then(result => { if (active) { setEvents(result); setError('') } }).catch(failure => {
      if (active) { setError(failure.message); if (failure.status === 401) setUser(null) }
    })
    return () => { active = false }
  }, [user, attempt])
  // Stable callback prevents child data effects from restarting on parent renders.
  const onFailure = useCallback(failure => { if (failure.status === 401) { setUser(null); setEvents(null); setError(failure.message) } }, [])
  async function login(e) {
    e.preventDefault()
    if (busy) return
    const form = e.currentTarget
    const fields = new FormData(form)
    setBusy(true); setError('')
    try { setUser(await api.login(fields.get('email'), fields.get('password'))) }
    catch (failure) { setError(failure.message) }
    finally { form.reset(); setBusy(false) }
  }
  async function logout() {
    setBusy(true); setUser(null); setEvents(null); setEventId(''); setError('')
    try { await api.logout() } catch { setError('You are logged out on this device; the server did not confirm ending the session.') }
    finally { setBusy(false) }
  }
  const selected = events?.find(event => String(event.id) === eventId)
  return <div className="mw"><aside><a href="/" className="mw-brand">biletflow<span>{t('ORGANIZER')}</span></a><nav aria-label={t('Campaigns')}><a href="/organizer/campaigns/new" aria-current="page">{t('Promo campaigns')}</a><a href="/">{t('Home page')}</a></nav></aside><main><header><p className="mw-eyebrow">BILETFLOW · {t('ORGANIZER')}</p><h1>{t('Promo campaigns')}</h1></header>
    {error && <p className="mw-notice" role="alert">{t(error)}</p>}
    {loading ? <p role="status">{t('Checking your session…')}</p> : !user ? <form className="mw-panel mw-login" onSubmit={login}><h2>{t('Organizer login')}</h2><label>{t('Email')}<input name="email" type="email" autoComplete="username" required disabled={busy} /></label><label>{t('Password')}<input name="password" type="password" autoComplete="current-password" required disabled={busy} /></label><button disabled={busy}>{busy ? t('Please wait…') : t('Login')}</button><p>{t('For organizers and platform admins.')}</p></form> : <>
      <section className="mw-panel mw-account"><p>{user.email}</p><button disabled={busy} onClick={logout}>{t('Logout')}</button></section>
      {!events ? <section className="mw-panel">{error ? <button onClick={() => setAttempt(value => value + 1)}>{t('Try loading events again')}</button> : <p role="status">{t('Loading events…')}</p>}</section> : events.length === 0 ? <section className="mw-panel"><h2>{t('No events yet')}</h2><p>{t('Create an event in the organizer dashboard or through the API first, then refresh the list.')}</p><button onClick={() => setAttempt(value => value + 1)}>{t('Refresh events')}</button></section> : <section className="mw-panel"><label>{t('Event')}<select value={eventId} onChange={e => setEventId(e.target.value)}><option value="">{t('Choose an event')}</option>{events.map(event => <option key={event.id} value={event.id}>{event.title} · #{event.id}{event.published ? '' : ` · ${t('draft')}`}</option>)}</select></label></section>}
      {selected && <CampaignEditor key={selected.id} event={selected} onFailure={onFailure} />}
    </>}
  </main></div>
}
