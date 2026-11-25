import { useCallback, useEffect, useState } from 'react'
import {
  adminReportPath,
  downloadBlob,
  formatMoney,
  listAll,
  orderStatus,
  paymentStatus,
  reportReason,
  reportStatus,
  supportStatus,
} from './adminData.js'

const localDate = value => value ? new Date(value).toLocaleString('ru-KZ') : '—'
const percent = bps => `${(Number(bps || 0) / 100).toLocaleString('ru-KZ')}%`

function useRows(api, kind, initial = {}) {
  const [filters, setFilters] = useState(initial)
  const [applied, setApplied] = useState(initial)
  const [result, setResult] = useState({ path: null, rows: null })
  const [error, setError] = useState('')
  const path = adminReportPath(kind, applied)
  const rows = result.path === path ? result.rows : null
  const load = useCallback(async () => {
    setError('')
    try { setResult({ path, rows: await listAll(api, path) }) } catch (failure) { setError(failure.message) }
  }, [api, path])
  useEffect(() => {
    let active = true
    listAll(api, path).then(value => { if (active) setResult({ path, rows: value }) }).catch(failure => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [api, path])
  function apply(event) { event.preventDefault(); setApplied({ ...filters }) }
  function clear() { setFilters(initial); setApplied(initial) }
  return { filters, setFilters, rows, error, setError, load, apply, clear }
}

function Filters({ state, search = false, statuses = [] }) {
  const update = event => state.setFilters(current => ({ ...current, [event.target.name]: event.target.value }))
  return <form className="mw-controls mw-report-filters" onSubmit={state.apply}>
    {search && <label>Поиск<input name="q" value={state.filters.q || ''} onChange={update} placeholder="Email, событие, ID или платёж" /></label>}
    {statuses.length > 0 && <label>Статус<select name="status" value={state.filters.status || ''} onChange={update}><option value="">Все</option>{statuses.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>}
    <label>Событие<input name="event" type="number" min="1" value={state.filters.event || ''} onChange={update} placeholder="ID" /></label>
    <label>От<input name="date_from" type="date" value={state.filters.date_from || ''} onChange={update} /></label>
    <label>До<input name="date_to" type="date" value={state.filters.date_to || ''} onChange={update} /></label>
    <div className="mw-filter-actions"><button type="submit">Применить</button><button type="button" className="mw-secondary" onClick={state.clear}>Сбросить</button></div>
  </form>
}

function Result({ state, empty, children }) {
  return <>{state.error && <p className="mw-notice" role="alert">{state.error}</p>}{!state.rows ? <p role="status">Загружаем данные…</p> : state.rows.length === 0 ? <p>{empty}</p> : children(state.rows)}</>
}

export function OrdersPanel({ api }) {
  const state = useRows(api, 'orders', { q: '', status: '', event: '', date_from: '', date_to: '' })
  return <section className="mw-panel"><div className="mw-account"><div><h2>Заказы по всей платформе</h2><p>Поиск по email покупателя, событию, ID заказа или UUID платежа.</p></div><button onClick={state.load}>Обновить</button></div><Filters state={state} search statuses={Object.entries({ pending: 'Ожидает оплаты', confirmed: 'Подтверждён', cancelled: 'Отменён', refunded: 'Возвращён' })} /><Result state={state} empty="Заказы не найдены.">{rows => <div className="mw-table"><table><thead><tr><th>Заказ</th><th>Событие</th><th>Покупатель</th><th>Билеты</th><th>Сумма</th><th>Статус</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>#{row.id}<small className="mw-block">{localDate(row.created_at)}</small></td><td>{row.event_title}<small className="mw-block">#{row.event}</small></td><td>{row.purchaser_email}</td><td>{row.tickets ?? 0}</td><td>{formatMoney(row.total_minor, row.currency)}{row.discount_minor > 0 && <small className="mw-block">скидка {formatMoney(row.discount_minor, row.currency)}</small>}</td><td><span className={`mw-badge ${row.status === 'confirmed' ? 'is-active' : row.status === 'refunded' || row.status === 'cancelled' ? 'is-suspended' : ''}`}>{orderStatus(row.status)}</span><small className="mw-block">симуляция</small></td></tr>)}</tbody></table></div>}</Result></section>
}

export function PaymentsPanel({ api }) {
  const state = useRows(api, 'payments', { q: '', status: '', event: '', date_from: '', date_to: '' })
  return <section className="mw-panel"><div className="mw-account"><div><h2>Платежи</h2><p>Все платежи являются симуляцией: реальные банковские данные не обрабатываются.</p></div><button onClick={state.load}>Обновить</button></div><Filters state={state} search statuses={Object.entries({ paid: 'Оплачен', refunded: 'Возвращён' })} /><Result state={state} empty="Платежи не найдены.">{rows => <div className="mw-table"><table><thead><tr><th>Платёж</th><th>Заказ и событие</th><th>Покупатель</th><th>Сумма</th><th>Комиссия</th><th>Статус</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>#{row.id}<small className="mw-block mw-break">{row.reference}</small></td><td>Заказ #{row.order}<small className="mw-block">{row.event_title} · #{row.event}</small></td><td>{row.purchaser_email}</td><td>{formatMoney(row.amount_minor, row.currency)}<small className="mw-block">{localDate(row.paid_at)}</small></td><td>{formatMoney(row.processing_fee_minor, row.currency)}</td><td><span className={`mw-badge ${row.status === 'paid' ? 'is-active' : 'is-suspended'}`}>{paymentStatus(row.status)}</span></td></tr>)}</tbody></table></div>}</Result></section>
}

function FailureTable({ rows }) {
  return <div className="mw-table"><table><thead><tr><th>Тип</th><th>Событие</th><th>Пользователь</th><th>Описание</th><th>Дата</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.kind === 'checkout' ? 'Оплата заказа' : 'Плата за активацию'}</td><td>{row.event_title} · #{row.event}{row.order && <small className="mw-block">Заказ #{row.order}</small>}</td><td>{row.user_email || '—'}</td><td>{row.description}</td><td>{localDate(row.created_at)}</td></tr>)}</tbody></table></div>
}

export function MonitoringPanel({ api }) {
  const [tab, setTab] = useState('payment-failures')
  const state = useRows(api, tab, { status: '', event: '', date_from: '', date_to: '' })
  const statuses = tab === 'disputes' ? [['open', 'Открыт'], ['in_progress', 'В работе'], ['waiting_for_customer', 'Ожидает пользователя'], ['resolved', 'Закрыт']] : []
  return <section className="mw-panel"><h2>Возвраты, споры и ошибки оплаты</h2><p>Единый мониторинг финансовых операций. Платежи и возвраты здесь также являются симуляцией.</p><div className="mw-tabs" role="tablist">{[['payment-failures', 'Ошибки оплаты'], ['refunds', 'Возвраты'], ['disputes', 'Споры']].map(([key, label]) => <button role="tab" aria-selected={tab === key} className={tab === key ? '' : 'mw-secondary'} key={key} onClick={() => setTab(key)}>{label}</button>)}</div><Filters state={state} statuses={statuses} /><Result state={state} empty="Записей не найдено.">{rows => tab === 'payment-failures' ? <FailureTable rows={rows} /> : tab === 'refunds' ? <div className="mw-table"><table><thead><tr><th>Возврат</th><th>Заказ</th><th>Событие</th><th>Покупатель</th><th>Сумма</th><th>Инициатор</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>#{row.id}<small className="mw-block">{localDate(row.created_at)}</small></td><td>#{row.order}</td><td>{row.event_title} · #{row.event}</td><td>{row.purchaser_email}</td><td>{formatMoney(row.amount_minor, row.currency)}</td><td>{row.initiated_by_email || '—'}</td></tr>)}</tbody></table></div> : <div className="mw-table"><table><thead><tr><th>Спор</th><th>Категория</th><th>Контекст</th><th>Заявитель</th><th>Статус</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>#{row.id} · {row.subject}<small className="mw-block">{localDate(row.created_at)}</small></td><td>{row.category === 'refund' ? 'Возврат' : 'Оплата'}</td><td>{row.event ? `Событие #${row.event}` : 'Платформа'}{row.order && <small className="mw-block">Заказ #{row.order}</small>}</td><td>{row.requester_email}</td><td>{supportStatus(row.status)}</td></tr>)}</tbody></table></div>}</Result></section>
}

export function EventReportsPanel({ api }) {
  const state = useRows(api, 'event-reports', { status: '', event: '', date_from: '', date_to: '' })
  const [notes, setNotes] = useState({})
  const [busy, setBusy] = useState(null)
  async function review(row, status) {
    setBusy(row.id); state.setError('')
    try {
      await api(`/admin/event-reports/${row.id}`, { method: 'PATCH', body: { status, resolution_note: (notes[row.id] || '').trim() } })
      await state.load()
    } catch (failure) { state.setError(failure.message) } finally { setBusy(null) }
  }
  return <section className="mw-panel"><h2>Жалобы на события</h2><p>Официальные жалобы посетителей. После проверки событие можно отдельно приостановить в разделе «События».</p><Filters state={state} statuses={Object.entries({ open: 'Открыта', reviewed: 'Проверена', dismissed: 'Отклонена' })} /><Result state={state} empty="Жалобы не найдены.">{rows => <div className="mw-admin-cards">{rows.map(row => <article className="mw-admin-card" key={row.id}><div><h3>#{row.id} · {row.event_title}</h3><p><strong>{reportReason(row.reason)}</strong> · {row.reporter_email}</p><p>{row.details || 'Дополнительного описания нет.'}</p><span className={`mw-badge ${row.status === 'reviewed' ? 'is-active' : row.status === 'open' ? 'is-suspended' : ''}`}>{reportStatus(row.status)}</span>{row.event_suspended && <small className="mw-block">Событие приостановлено</small>}</div><div><label>Результат проверки<input value={notes[row.id] ?? row.resolution_note ?? ''} maxLength="300" onChange={event => setNotes(current => ({ ...current, [row.id]: event.target.value }))} placeholder="Необязательная заметка" /></label><div className="mw-actions"><button disabled={busy === row.id} onClick={() => review(row, 'reviewed')}>Проверено</button><button disabled={busy === row.id} className="mw-danger" onClick={() => review(row, 'dismissed')}>Отклонить</button>{row.status !== 'open' && <button disabled={busy === row.id} className="mw-secondary" onClick={() => review(row, 'open')}>Открыть снова</button>}</div></div></article>)}</div>}</Result></section>
}

export function SettingsPanel({ api }) {
  const [settings, setSettings] = useState(null)
  const [form, setForm] = useState({ activation: '', processing: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    api('/admin/settings').then(value => {
      if (!active) return
      setSettings(value)
      setForm({ activation: String(value.activation_fee_minor / 100), processing: String(value.processing_fee_bps / 100) })
    }).catch(failure => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [api])
  async function patch(body) {
    setBusy(true); setError('')
    try {
      const value = await api('/admin/settings', { method: 'PATCH', body })
      setSettings(value)
      setForm({ activation: String(value.activation_fee_minor / 100), processing: String(value.processing_fee_bps / 100) })
    } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  function save(event) {
    event.preventDefault()
    patch({ activation_fee_minor: Math.round(Number(form.activation) * 100), processing_fee_bps: Math.round(Number(form.processing) * 100) })
  }
  return <section className="mw-panel"><h2>Параметры платформы</h2><p>Новые значения применяются только к будущим активациям и платежам. Ранее записанные суммы не меняются.</p>{error && <p className="mw-notice" role="alert">{error}</p>}{!settings ? <p role="status">Загружаем настройки…</p> : <><form className="mw-settings-form" onSubmit={save}><label>Сумма активации, ₸<input type="number" min="0" max="1000000" step="0.01" required value={form.activation} onChange={event => setForm(current => ({ ...current, activation: event.target.value }))} /><small>{settings.overridden.activation_fee_minor ? 'Изменено администратором' : 'Значение deployment по умолчанию'}</small></label><label>Комиссия платформы, %<input type="number" min="0" max="100" step="0.01" required value={form.processing} onChange={event => setForm(current => ({ ...current, processing: event.target.value }))} /><small>{settings.overridden.processing_fee_bps ? 'Изменено администратором' : 'Значение deployment по умолчанию'}</small></label><button disabled={busy} type="submit">{busy ? 'Сохраняем…' : 'Сохранить параметры'}</button></form><div className="mw-settings-meta"><p>Сейчас: {formatMoney(settings.activation_fee_minor, settings.currency)} · комиссия {percent(settings.processing_fee_bps)}</p>{settings.updated_by_email && <p>Последнее изменение: {settings.updated_by_email} · {localDate(settings.updated_at)}</p>}<div className="mw-actions"><button disabled={busy} className="mw-secondary" onClick={() => patch({ activation_fee_minor: null })}>Сбросить сумму</button><button disabled={busy} className="mw-secondary" onClick={() => patch({ processing_fee_bps: null })}>Сбросить комиссию</button></div></div></>}</section>
}

const exportKinds = [
  ['orders', 'Заказы'], ['payments', 'Платежи'], ['payment-failures', 'Ошибки оплаты'],
  ['refunds', 'Возвраты'], ['disputes', 'Споры'], ['activations', 'Активации'], ['event-reports', 'Жалобы на события'],
]

export function ServerExportsPanel({ api }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  async function download(kind) {
    setBusy(kind); setError('')
    try {
      const blob = await api(`/admin/exports/${kind}`, { as: 'blob' })
      downloadBlob(`biletflow-${kind}-${new Date().toISOString().slice(0, 10)}.csv`, blob)
    } catch (failure) { setError(failure.message) } finally { setBusy('') }
  }
  return <section className="mw-panel"><h2>Экспорт операционных отчётов</h2><p>Сервер формирует полные UTF-8 CSV-файлы. Они открываются в Excel и содержат актуальные данные на момент скачивания.</p>{error && <p className="mw-notice" role="alert">{error}</p>}<div className="mw-export-grid">{exportKinds.map(([kind, label]) => <button disabled={Boolean(busy)} key={kind} onClick={() => download(kind)}>{busy === kind ? 'Готовим…' : `${label} (.csv)`}</button>)}</div></section>
}
