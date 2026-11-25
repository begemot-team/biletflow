import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { DICTIONARIES, SERVER_TEMPLATES, formatDate, formatDayMonth, normalizeLanguage, translate } from '../src/i18n/translate.js'
import { STATUS_LABELS, STEP_LABELS, payoutReferenceError } from '../src/utils/activation.js'
import { analyticsQuery } from '../src/utils/analytics.js'
import { ACTIVITY_LABELS, ENTITY_LABELS, EVENT_STATUS } from '../src/utils/eventHistory.js'
import { ACTION_LABEL, CONFIRM_LABEL, ORDER_STATUS, confirmText } from '../src/utils/orders.js'
import { SHOWCASE } from '../src/utils/showcase.js'
import { PERMISSIONS, validateStaffForm } from '../src/utils/staff.js'
import { ATTENDEE_CATEGORIES, PLATFORM_CATEGORIES, STATUSES } from '../src/utils/support.js'

const { kk, ru } = DICTIONARIES
const placeholders = (text) => (text.match(/\{\w+\}/g) ?? []).sort()

// Every t('…') text in the app.
function usedTexts() {
  const root = new URL('../src/', import.meta.url)
  const files = readdirSync(root, { recursive: true }).filter((name) => /\.jsx?$/.test(name))
  return files.flatMap((name) =>
    [...readFileSync(new URL(name.replaceAll('\\', '/'), root), 'utf8').matchAll(/\bt\(\s*(['"])(.+?)\1\s*[,)]/g)].map((match) => match[2]))
}

test('Russian and Kazakh cover the same texts with the same placeholders', () => {
  assert.deepEqual(Object.keys(kk).sort(), Object.keys(ru).sort())
  for (const key of Object.keys(ru)) {
    assert.ok(ru[key] && kk[key], `empty translation: ${key}`)
    assert.deepEqual(placeholders(ru[key]), placeholders(key), key)
    assert.deepEqual(placeholders(kk[key]), placeholders(key), key)
  }
})

test('every text passed to t() is translated', () => {
  const texts = usedTexts()
  assert.ok(texts.length > 150)
  assert.deepEqual([...new Set(texts)].filter((text) => !Object.hasOwn(ru, text)), [])
})

test('statuses and categories shown to customers are translated', () => {
  const labels = [ORDER_STATUS, STATUSES, ATTENDEE_CATEGORIES, PLATFORM_CATEGORIES].flatMap(Object.values)
  labels.push('Valid', 'Checked in', 'Waiting for your reply', 'Free')
  labels.push('music', 'education', 'sports', 'tech', 'arts', 'business', 'other')
  // Performers keep their own names.
  for (const { title, place, fact } of SHOWCASE) labels.push(place, fact, ...(['Ye (Kanye West)', 'Backstreet Boys'].includes(title) ? [] : [title]))
  for (const label of labels) assert.ok(Object.hasOwn(ru, label), label)
})

test('labels and form errors shown to organizers are translated', () => {
  const labels = [STEP_LABELS, STATUS_LABELS, ACTIVITY_LABELS, ENTITY_LABELS, EVENT_STATUS, ACTION_LABEL, CONFIRM_LABEL, PERMISSIONS].flatMap(Object.values)
  labels.push('Published', ...SERVER_TEMPLATES)
  for (const action of ['refund', 'cancel']) {
    for (const tickets of [1, 2]) labels.push(confirmText({ action, tickets, total_minor: 100 }).text)
  }
  for (const value of ['', 'x'.repeat(65), '4400430123456789']) labels.push(payoutReferenceError(value))
  const staff = [{ user_email: 'in@example.com' }]
  for (const form of [{ email: '' }, { email: 'x' }, { email: 'me@example.com' }, { email: 'in@example.com' }, { email: 'new@example.com' }]) {
    labels.push(...Object.values(validateStaffForm(form, staff, 'me@example.com')))
  }
  for (const filters of [{ from: '2026-11-01' }, { from: '2026-11-02', to: '2026-11-01' }]) {
    assert.throws(() => analyticsQuery(filters), ({ message }) => Boolean(labels.push(message)))
  }
  // Set in state with setError / setNotice and translated when shown.
  labels.push('Order #{id} refunded.', 'Order #{id} cancelled.', '{email} is now an Event Admin.', '{email} was removed.',
    'Payout account connected.', 'Identity verified.', 'Terms accepted.', 'Activation fee paid. Paid tickets are on sale.',
    'Enter a price in tenge, e.g. 2500 or 2500.50', 'No active BiletFlow account uses this email. Ask them to register first.')
  for (const label of labels) assert.ok(Object.hasOwn(ru, label), label)
})

test('pages have no text or date format that ignores the language', () => {
  const names = new Set(['Begemot.com', 'Google Calendar ↗', 'SIM-PAYOUT-1'])
  const folders = ['pages', 'components', 'auth']
  const left = folders.flatMap((folder) => {
    const root = new URL(`../src/${folder}/`, import.meta.url)
    return readdirSync(root).filter((name) => name.endsWith('.jsx')).flatMap((name) => {
      const code = readFileSync(new URL(name, root), 'utf8')
      const texts = [
        ...code.matchAll(/(?<!=)>([^<>{}=;()]*\p{L}{2}[^<>{}=;()]*)<\//gu), // <p>Text</p>
        ...code.matchAll(/\b(?:label|detail|placeholder|aria-label|title|alt)="([^"]*\p{L}{2}[^"]*)"/gu),
        ...code.matchAll(/(DateTimeFormat\(['"]|toLocale\w*String\()/g),
      ]
      return texts.map((match) => match[1].trim()).filter((text) => !names.has(text)).map((text) => `${name}: ${text}`)
    })
  })
  assert.deepEqual(left, [])
})

test('one English word can have two translations', () => {
  assert.equal(translate('en', 'Cancelled::event'), 'Cancelled')
  assert.equal(translate('ru', 'Cancelled'), 'Отменён')
  assert.equal(translate('ru', 'Cancelled::event'), 'Отменено')
  assert.equal(translate('ru', 'Unknown::event'), 'Unknown')
})

test('server messages with a value are translated', () => {
  assert.equal(translate('en', 'Request failed (404).'), 'Request failed (404).')
  assert.equal(translate('ru', 'Request failed (404).'), 'Запрос не выполнен (404).')
  assert.equal(translate('ru', 'Unused tickets invalidated: 4. Holds closed: 1. Free orders cancelled: 2.'),
    'Аннулировано неиспользованных билетов: 4. Закрыто броней: 1. Отменено бесплатных заказов: 2.')
  assert.equal(translate('ru', 'Requestfailed (404).'), 'Requestfailed (404).')
})

test('missing texts and languages fall back to English', () => {
  assert.equal(translate('ru', 'Brand new server message'), 'Brand new server message')
  assert.equal(translate('en', 'Order #{id}', { id: 5 }), 'Order #5')
  assert.equal(translate('ru', 'Order #{id}', { id: 5 }), 'Заказ №5')
  assert.equal(translate('kk', 'constructor'), 'constructor')
  assert.equal(translate('ru', undefined), undefined)
  assert.equal(normalizeLanguage('de'), 'en')
  assert.equal(normalizeLanguage(null), 'en')
  assert.equal(normalizeLanguage('kk'), 'kk')
})

test('values are inserted as typed, even when they look like placeholders', () => {
  assert.equal(translate('en', 'Holder: {name}', { name: '{id} $&' }), 'Holder: {id} $&')
})

test('dates follow the language', () => {
  const options = { dateStyle: 'full', timeZone: 'Asia/Almaty' }
  assert.match(formatDate('en', '2026-12-04T19:00:00+05:00', options), /December/)
  assert.match(formatDate('ru', '2026-12-04T19:00:00+05:00', options), /декабря/)
  // Not from Intl: Chrome has no Kazakh month names, even though Node does.
  assert.equal(formatDate('kk', '2026-12-04T19:00:00+05:00', { ...options, timeStyle: 'short' }), '2026 ж. 4 желтоқсан, жұма, 19:00')
  assert.equal(formatDate('kk', '2026-12-04T00:05:00+05:00', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Almaty' }), '2026 ж. 4 желтоқсан, 00:05')
  assert.equal(formatDate('kk', '2026-01-01T12:00:00+05:00', { dateStyle: 'medium', timeZone: 'Asia/Almaty' }), '2026 ж. 1 қаңтар')
})

test('date stubs show the day and a short month', () => {
  const stub = (language, value) => formatDayMonth(language, value, 'Asia/Almaty')
  assert.deepEqual(stub('en', '2026-12-04T19:00:00+05:00'), { day: '4', month: 'Dec' })
  assert.deepEqual(stub('ru', '2026-12-04T19:00:00+05:00'), { day: '4', month: 'дек' })
  assert.deepEqual(stub('kk', '2026-12-04T19:00:00+05:00'), { day: '4', month: 'жел' })
  assert.deepEqual(stub('kk', '2026-01-01T00:30:00+05:00'), { day: '1', month: 'қаң' })
})
