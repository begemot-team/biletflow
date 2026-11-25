import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { DICTIONARIES, formatDate, formatDayMonth, normalizeLanguage, translate } from '../src/i18n/translate.js'
import { ORDER_STATUS } from '../src/utils/orders.js'
import { SHOWCASE } from '../src/utils/showcase.js'
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
