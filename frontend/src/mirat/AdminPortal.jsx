import { useCallback, useEffect, useRef, useState } from 'react'
import { createAdminAuth } from './adminAuth.js'
import {
  activationStatus,
  formatMoney,
  listAll,
  loadPromoActivity,
  supportStatus,
} from './adminData.js'
import {
  EventReportsPanel,
  MonitoringPanel,
  OrdersPanel,
  PaymentsPanel,
  ServerExportsPanel,
  SettingsPanel,
} from './AdminBackOffice.jsx'
import './workspace.css'

let storage
try { storage = window.sessionStorage } catch { storage = { getItem: () => null, setItem() {}, removeItem() {} } }
const auth = createAdminAuth(storage)

const sections = {
  overview: 'Обзор платформы',
  users: 'Пользователи',
  events: 'События',
  activations: 'Активация продаж',
  orders: 'Заказы',
  payments: 'Платежи',
  monitoring: 'Финансовый мониторинг',
  reports: 'Жалобы на события',
  complaints: 'Обращения посетителей',
  support: 'Эскалации',
  promos: 'Промокоды',
  settings: 'Настройки платформы',
  exports: 'Экспорт отчётов',
}

const categories = {
  ticket_delivery: 'Доставка билета', payment: 'Оплата', refund: 'Возврат', seating: 'Места',
  event_information: 'Информация о событии', check_in: 'Вход', account: 'Аккаунт',
  activation: 'Активация', technical: 'Техническая проблема',
}

function useAdminList(path) {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setError('')
    try { setItems(await listAll(auth.api, path)) } catch (failure) { setError(failure.message) }
  }, [path])
  useEffect(() => {
    let active = true
    listAll(auth.api, path).then(value => { if (active) setItems(value) }).catch(failure => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [path])
  return { items, setItems, error, setError, load }
}

function Overview({ select }) {
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    auth.api('/admin/summary').then(value => { if (active) setSummary(value) }).catch(failure => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [])
  const cards = [
    ['activations', 'Активации', 'Реальные записи и приостановка продаж'],
    ['users', 'Пользователи', 'Поиск, блокировка и восстановление'],
    ['events', 'События', 'Поиск и модерация событий'],
    ['orders', 'Заказы', 'Поиск по всей платформе', 'orders'],
    ['payments', 'Платежи', 'Симулированные оплаты и комиссии', 'payments'],
    ['monitoring', 'Финансовый мониторинг', 'Ошибки, возвраты и споры', 'payment_failures'],
    ['reports', 'Жалобы', 'Проверка жалоб на события', 'open_event_reports'],
    ['complaints', 'Обращения', 'Поддержка посетителей по событиям'],
    ['support', 'Эскалации', 'Обращения организаторов к платформе', 'open_disputes'],
    ['promos', 'Промокоды', 'Использования, скидки и возвраты'],
    ['settings', 'Настройки', 'Сумма активации и комиссия'],
    ['exports', 'Отчёты', 'CSV для операционной проверки'],
  ]
  return <>
    <section className="mw-panel"><p className="mw-eyebrow">PHASE 06 · OPERATIONS</p><h2>Управление платформой</h2><p>Проверяйте пользователей, события, платные продажи, обращения и промокампании. Все данные ниже загружаются из BiletFlow API.</p></section>
    {error && <p className="mw-notice" role="alert">Сводка временно недоступна: {error}</p>}
    <div className="mw-stats mw-admin-stats">{cards.map(([key, title, detail, metric]) => <button key={key} className="mw-panel mw-dashboard-link" onClick={() => select(key)}><strong>{title}</strong>{metric && summary && <span className="mw-summary-count">{summary[metric]}</span>}<small>{detail}</small></button>)}</div>
  </>
}

function UsersPanel() {
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)
  const load = useCallback(async (search = '') => {
    setError(''); setUsers(null)
    try { setUsers(await listAll(auth.api, `/admin/users?search=${encodeURIComponent(search.trim())}`)) } catch (failure) { setError(failure.message) }
  }, [])
  useEffect(() => {
    let active = true
    listAll(auth.api, '/admin/users?search=').then(value => { if (active) setUsers(value) }).catch(failure => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [])
  async function toggle(user) {
    setBusy(user.id); setError('')
    try {
      const updated = await auth.api(`/admin/users/${user.id}/suspend`, { method: 'POST', body: { suspended: user.is_active } })
      setUsers(current => current.map(item => item.id === updated.id ? updated : item))
    } catch (failure) { setError(failure.message) } finally { setBusy(null) }
  }
  return <section className="mw-panel"><h2>Пользователи</h2><p>Приостановленный пользователь теряет текущие сессии и не может войти.</p><form className="mw-controls" onSubmit={event => { event.preventDefault(); load(query) }}><label>Поиск по email<input value={query} onChange={event => setQuery(event.target.value)} placeholder="user@example.com" /></label><button type="submit">Найти</button></form>{error && <p className="mw-notice" role="alert">{error}</p>}{!users ? <p role="status">Загружаем пользователей…</p> : users.length === 0 ? <p>Пользователи не найдены.</p> : <div className="mw-table"><table><thead><tr><th>Email</th><th>Роли</th><th>Статус</th><th>Действие</th></tr></thead><tbody>{users.map(user => <tr key={user.id}><td>{user.email}</td><td>{user.roles.join(', ') || 'attendee'}</td><td><span className={`mw-badge ${user.is_active ? 'is-active' : 'is-suspended'}`}>{user.is_active ? 'Активен' : 'Приостановлен'}</span></td><td>{user.roles.includes('platform_admin') ? <small>Администратор защищён</small> : <button className={user.is_active ? 'mw-danger' : ''} disabled={busy === user.id} onClick={() => toggle(user)}>{busy === user.id ? 'Сохраняем…' : user.is_active ? 'Приостановить' : 'Восстановить'}</button>}</td></tr>)}</tbody></table></div>}</section>
}

function EventsPanel() {
  const { items: events, setItems: setEvents, error, setError, load } = useAdminList('/me/events')
  const [query, setQuery] = useState('')
  const [reasons, setReasons] = useState({})
  const [busy, setBusy] = useState(null)
  async function toggle(item) {
    const suspending = !item.suspended_at
    const reason = (reasons[item.id] || '').trim()
    if (suspending && !reason) { setError('Укажите причину приостановки события.'); return }
    setBusy(item.id); setError('')
    try {
      const updated = await auth.api(`/admin/events/${item.id}/suspend`, { method: 'POST', body: { suspended: suspending, reason } })
      setEvents(current => current.map(value => value.id === updated.id ? updated : value))
      setReasons(current => ({ ...current, [item.id]: '' }))
    } catch (failure) { setError(failure.message) } finally { setBusy(null) }
  }
  const visible = events?.filter(item => `${item.title} ${item.venue} ${item.id}`.toLowerCase().includes(query.toLowerCase()))
  return <section className="mw-panel"><div className="mw-account"><div><h2>Модерация событий</h2><p>Приостановка закрывает новые продажи и публичные Campaign QR. Уже выданные билеты остаются действительными.</p></div><button disabled={!events} onClick={load}>Обновить</button></div><label>Поиск события<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Название, место или ID" /></label>{error && <p className="mw-notice" role="alert">{error}</p>}{!events ? <p role="status">Загружаем события…</p> : visible.length === 0 ? <p>События не найдены.</p> : <div className="mw-admin-cards">{visible.map(item => <article className="mw-admin-card" key={item.id}><div><h3>{item.title} · #{item.id}</h3><p>{item.venue}</p><span className={`mw-badge ${item.suspended_at ? 'is-suspended' : 'is-active'}`}>{item.suspended_at ? 'Приостановлено' : item.cancelled_at ? 'Отменено' : item.published ? 'Опубликовано' : 'Черновик'}</span>{item.suspension_reason && <p><strong>Причина:</strong> {item.suspension_reason}</p>}</div><div>{!item.suspended_at && <label>Причина<input value={reasons[item.id] || ''} maxLength={300} onChange={change => setReasons(current => ({ ...current, [item.id]: change.target.value }))} placeholder="Обязательна для приостановки" /></label>}<button className={!item.suspended_at ? 'mw-danger' : ''} disabled={busy === item.id} onClick={() => toggle(item)}>{busy === item.id ? 'Сохраняем…' : item.suspended_at ? 'Восстановить событие' : 'Приостановить событие'}</button></div></article>)}</div>}</section>
}

function ActivationsPanel() {
  const { items, setItems, error, setError, load } = useAdminList('/admin/activations')
  const [reasons, setReasons] = useState({})
  const [busy, setBusy] = useState(null)
  async function toggle(item) {
    const suspending = item.status !== 'suspended'
    const reason = (reasons[item.id] || '').trim()
    if (suspending && !reason) { setError('Укажите причину приостановки платных продаж.'); return }
    setBusy(item.id); setError('')
    try {
      const updated = await auth.api(`/admin/activations/${item.id}/suspend`, { method: 'POST', body: { suspended: suspending, reason } })
      setItems(current => current.map(value => value.id === updated.id ? { ...value, ...updated } : value))
      setReasons(current => ({ ...current, [item.id]: '' }))
    } catch (failure) { setError(failure.message) } finally { setBusy(null) }
  }
  return <section className="mw-panel"><div className="mw-account"><div><h2>Записи активации платных продаж</h2><p>Фактическое состояние чек-листа и симулированной платы для каждого события.</p></div><button disabled={!items} onClick={load}>Обновить</button></div>{error && <p className="mw-notice" role="alert">{error}</p>}{!items ? <p role="status">Загружаем записи…</p> : items.length === 0 ? <p>Записей активации пока нет.</p> : <div className="mw-table"><table><thead><tr><th>Событие</th><th>Организатор</th><th>Статус</th><th>Плата</th><th>Действие</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.event_title} · #{item.event}</td><td>{item.organizer_email}</td><td><span className={`mw-badge ${item.status === 'active' ? 'is-active' : item.status === 'suspended' ? 'is-suspended' : ''}`}>{activationStatus(item.status)}</span>{item.suspension_reason && <small className="mw-block">{item.suspension_reason}</small>}</td><td>{formatMoney(item.fee_minor, item.currency)}<small className="mw-block">симуляция</small></td><td>{item.status !== 'suspended' && <input aria-label={`Причина для ${item.event_title}`} value={reasons[item.id] || ''} maxLength={300} onChange={event => setReasons(current => ({ ...current, [item.id]: event.target.value }))} placeholder="Причина" />}<button className={item.status !== 'suspended' ? 'mw-danger mw-button-gap' : ''} disabled={busy === item.id} onClick={() => toggle(item)}>{busy === item.id ? 'Сохраняем…' : item.status === 'suspended' ? 'Возобновить' : 'Приостановить'}</button></td></tr>)}</tbody></table></div>}</section>
}

function CasesPanel({ kind }) {
  const title = kind === 'attendee' ? 'Жалобы и обращения по событиям' : 'Эскалированные обращения организаторов'
  const intro = kind === 'attendee' ? 'Обращения посетителей с контекстом события, заказа или билета.' : 'Обращения организаторов к платформе по аккаунту, активации, оплате и техническим вопросам.'
  const { items, setItems, error, setError, load } = useAdminList(`/support-cases?kind=${kind}`)
  const [status, setStatus] = useState('active')
  const [busy, setBusy] = useState(null)
  async function change(item, next) {
    setBusy(item.id); setError('')
    try {
      const updated = await auth.api(`/support-cases/${item.id}`, { method: 'PATCH', body: { status: next } })
      setItems(current => current.map(value => value.id === updated.id ? updated : value))
    } catch (failure) { setError(failure.message) } finally { setBusy(null) }
  }
  const visible = items?.filter(item => status === 'all' || (status === 'active' ? item.status !== 'resolved' : item.status === status))
  return <section className="mw-panel"><div className="mw-account"><div><h2>{title}</h2><p>{intro}</p></div><button disabled={!items} onClick={load}>Обновить</button></div><label>Статус<select value={status} onChange={event => setStatus(event.target.value)}><option value="active">Требуют внимания</option><option value="all">Все</option><option value="open">Открытые</option><option value="in_progress">В работе</option><option value="waiting_for_customer">Ожидают пользователя</option><option value="resolved">Закрытые</option></select></label>{error && <p className="mw-notice" role="alert">{error}</p>}{!items ? <p role="status">Загружаем обращения…</p> : visible.length === 0 ? <p>Обращений с таким статусом нет.</p> : <div className="mw-table"><table><thead><tr><th>Обращение</th><th>Контекст</th><th>Заявитель</th><th>Статус</th><th>Рассмотрение</th></tr></thead><tbody>{visible.map(item => <tr key={item.id}><td>#{item.id} · {item.subject}<br /><small>{categories[item.category] || item.category} · {new Date(item.updated_at).toLocaleString('ru-KZ')}</small></td><td>{item.event ? `Событие #${item.event}` : 'Платформа'}{item.order ? <><br /><small>Заказ #{item.order}</small></> : null}{item.ticket ? <><br /><small>Билет #{item.ticket}</small></> : null}</td><td>{item.requester_email}</td><td><span className={`mw-badge ${item.status === 'resolved' ? 'is-active' : item.status === 'open' ? 'is-suspended' : ''}`}>{supportStatus(item.status)}</span></td><td><div className="mw-actions"><button disabled={busy === item.id || item.status === 'in_progress'} onClick={() => change(item, 'in_progress')}>В работу</button><button disabled={busy === item.id || item.status === 'waiting_for_customer'} onClick={() => change(item, 'waiting_for_customer')}>Ждём ответ</button><button disabled={busy === item.id || item.status === 'resolved'} onClick={() => change(item, 'resolved')}>Закрыть</button></div></td></tr>)}</tbody></table></div>}</section>
}

function PromosPanel() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setError('')
    try {
      const events = await listAll(auth.api, '/me/events')
      setRows(await loadPromoActivity(auth.api, events))
    } catch (failure) { setError(failure.message) }
  }, [])
  useEffect(() => {
    let active = true
    listAll(auth.api, '/me/events')
      .then(events => loadPromoActivity(auth.api, events))
      .then(value => { if (active) setRows(value) })
      .catch(failure => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [])
  return <section className="mw-panel"><div className="mw-account"><div><h2>Активность промокодов</h2><p>Сводка по всем кампаниям: применения, билеты, скидки, возвраты и итоговая выручка.</p></div><button disabled={!rows} onClick={load}>Обновить</button></div>{error && <p className="mw-notice" role="alert">{error}</p>}{!rows ? <p role="status">Загружаем кампании…</p> : rows.length === 0 ? <p>Промокампаний пока нет.</p> : <div className="mw-table"><table><thead><tr><th>Кампания</th><th>Код</th><th>Использования</th><th>Билеты</th><th>Скидка</th><th>Возвраты</th><th>Итого</th></tr></thead><tbody>{rows.map(item => <tr key={item.id}><td>{item.name} · #{item.id}<br /><small>{item.event_title} · событие #{item.event}</small></td><td>{item.codes.map(code => code.code).join(', ')}</td><td>{item.report.redemptions}{item.max_redemptions ? ` / ${item.max_redemptions}` : ''}</td><td>{item.report.tickets_sold}</td><td>{formatMoney(item.report.discount_minor)}</td><td>{formatMoney(item.report.refund_minor)}</td><td>{formatMoney(item.report.net_minor)}</td></tr>)}</tbody></table></div>}</section>
}

function panel(section) {
  if (section === 'users') return <UsersPanel />
  if (section === 'events') return <EventsPanel />
  if (section === 'activations') return <ActivationsPanel />
  if (section === 'orders') return <OrdersPanel api={auth.api} />
  if (section === 'payments') return <PaymentsPanel api={auth.api} />
  if (section === 'monitoring') return <MonitoringPanel api={auth.api} />
  if (section === 'reports') return <EventReportsPanel api={auth.api} />
  if (section === 'complaints') return <CasesPanel kind="attendee" />
  if (section === 'support') return <CasesPanel kind="platform" />
  if (section === 'promos') return <PromosPanel />
  if (section === 'settings') return <SettingsPanel api={auth.api} />
  if (section === 'exports') return <ServerExportsPanel api={auth.api} />
  return <ServerExportsPanel api={auth.api} />
}

export default function AdminPortal() {
  const revision = useRef(0)
  const operation = useRef(false)
  const [session, setSession] = useState({ loading: true, user: null })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [section, setSection] = useState('overview')
  useEffect(() => {
    let active = true
    async function check() {
      if (operation.current) return
      const started = revision.current
      try { const user = await auth.restore(); if (active && started === revision.current) { setSession({ loading: false, user }); if (user) setError(''); window.history.replaceState(null, '', user ? '/admin' : '/admin/login') } }
      catch (failure) { if (active && started === revision.current) { setSession({ loading: false, user: null }); setError(failure.message); window.history.replaceState(null, '', '/admin/login') } }
    }
    check()
    const onFocus = () => { if (!operation.current && auth.hasSession()) { setSession({ loading: true, user: null }); check() } }
    window.addEventListener('focus', onFocus)
    const timer = window.setInterval(check, 60000)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [])
  async function login(event) {
    event.preventDefault(); if (busy) return
    revision.current += 1; operation.current = true
    const form = event.currentTarget; const data = new FormData(form)
    setBusy(true); setError('')
    try { const user = await auth.login(data.get('email'), data.get('password')); setSession({ loading: false, user }); window.history.replaceState(null, '', '/admin') } catch (failure) { setError(failure.message) } finally { form.reset(); operation.current = false; setBusy(false) }
  }
  async function logout() {
    revision.current += 1; operation.current = true; setBusy(true); setSession({ loading: false, user: null }); setError(''); window.history.replaceState(null, '', '/admin/login')
    try { await auth.logout() } catch { setError('Вы вышли на этом устройстве. Сервер не подтвердил отзыв сессии.') } finally { operation.current = false; setBusy(false); setSection('overview') }
  }
  return <div className="mw"><aside><a className="mw-brand" href="/">biletflow<span>PLATFORM ADMIN</span></a>{session.user && <nav aria-label="Управление платформой">{Object.entries(sections).map(([key, label]) => <button key={key} type="button" aria-current={section === key ? 'page' : undefined} onClick={() => setSection(key)}>{label}</button>)}</nav>}</aside><main><header><p className="mw-eyebrow">BILETFLOW · УПРАВЛЕНИЕ</p><h1>{session.user ? sections[section] : 'Вход администратора'}</h1></header>{error && <p className="mw-notice" role="alert">{error}</p>}{session.loading ? <p role="status">Проверяем сессию…</p> : session.user ? <><section className="mw-panel mw-account"><div><strong>{session.user.first_name || 'Администратор платформы'}</strong><p>{session.user.email}</p></div><button disabled={busy} onClick={logout}>Выйти</button></section>{section === 'overview' ? <Overview select={setSection} /> : panel(section)}</> : <form className="mw-panel mw-login" onSubmit={login} aria-busy={busy}><p className="mw-eyebrow">PLATFORM ADMIN</p><h2>Вход в управление</h2><p>Войдите с аккаунтом администратора платформы.</p><label>Email<input name="email" type="email" autoComplete="username" required disabled={busy} /></label><label>Пароль<input name="password" type="password" autoComplete="current-password" required disabled={busy} /></label><button disabled={busy} type="submit">{busy ? 'Подождите…' : 'Войти'}</button><small>Доступ выдаёт администратор проекта. Аккаунты организаторов и сотрудников событий не дают доступа к этой панели.</small></form>}</main></div>
}
