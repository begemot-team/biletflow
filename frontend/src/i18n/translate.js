// Interface languages (SRS 7): Kazakh, Russian and English.
// The English text is the key, so anything missing from a dictionary (and any
// server message we do not know) is shown in English instead of breaking.

import kk from './kk.js'
import ru from './ru.js'

export const LANGUAGES = [
  { code: 'kk', label: 'Қаз', name: 'Қазақша' },
  { code: 'ru', label: 'Рус', name: 'Русский' },
  { code: 'en', label: 'Eng', name: 'English' },
]
export const DEFAULT_LANGUAGE = 'en'
export const DICTIONARIES = { kk, ru }

const LOCALES = { ru: 'ru-KZ', en: 'en-GB' }

export function normalizeLanguage(value) {
  return LANGUAGES.some(({ code }) => code === value) ? value : DEFAULT_LANGUAGE
}

// Server messages that carry a value, matched back to the dictionary key.
export const SERVER_TEMPLATES = [
  'Request failed ({status}).',
  // activity timeline
  '{amount} tiyn.',
  'Full refund of {amount} tiyn.',
  'Simulated activation fee of {amount} tiyn paid.',
  'Unused tickets invalidated: {tickets}. Holds closed: {holds}. Free orders cancelled: {orders}.',
  'Assigned to {email}.',
]
const SERVER_PATTERNS = SERVER_TEMPLATES.map((template) => ({
  template,
  pattern: new RegExp(`^${template.replace(/[.()]/g, '\\$&').replace(/\{(\w+)\}/g, '(?<$1>\\S+)')}$`),
}))

function serverTemplate(text) {
  for (const { template, pattern } of SERVER_PATTERNS) {
    const match = text.match(pattern)
    if (match) return { template, values: match.groups }
  }
  return null
}

// One English word can need two translations: 'Cancelled' (a ticket) and
// 'Cancelled::event'. The part after :: picks one and is never shown.
const withoutContext = (text) => text.replace(/::[a-z]+$/, '')

// translate('ru', 'Order #{id}', { id: 5 }) -> 'Заказ №5'
export function translate(language, text, values = {}) {
  if (typeof text !== 'string') return text
  const dictionary = DICTIONARIES[language]
  let template = withoutContext(text)
  if (dictionary && Object.hasOwn(dictionary, text)) {
    template = dictionary[text]
  } else if (dictionary) {
    const known = serverTemplate(text)
    if (known) {
      template = dictionary[known.template]
      values = known.values
    }
  }
  return template.replace(/\{(\w+)\}/g, (placeholder, name) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder)
}

const KK_MONTHS = ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан']
const KK_WEEKDAYS = { Mon: 'дүйсенбі', Tue: 'сейсенбі', Wed: 'сәрсенбі', Thu: 'бейсенбі', Fri: 'жұма', Sat: 'сенбі', Sun: 'жексенбі' }

// Chrome ships without Kazakh dates ("2026 M12 4, Fri"), so the names are ours
// and Intl is only asked for the numbers in the viewer's time zone.
function formatKazakhDate(instant, { dateStyle, timeStyle, timeZone }) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone,
  }).formatToParts(instant).map(({ type, value }) => [type, value]))
  const pieces = [`${parts.year} ж. ${Number(parts.day)} ${KK_MONTHS[parts.month - 1]}`]
  if (dateStyle === 'full') pieces.push(KK_WEEKDAYS[parts.weekday])
  if (timeStyle) pieces.push(`${parts.hour}:${parts.minute}`)
  return pieces.join(', ')
}

// Day and short month for an event's date stub: { day: '4', month: 'дек' }
export function formatDayMonth(language, value, timeZone) {
  const instant = new Date(value)
  const part = (options) => new Intl.DateTimeFormat(LOCALES[language] ?? LOCALES[DEFAULT_LANGUAGE], { ...options, timeZone }).format(instant)
  const month = language === 'kk'
    ? KK_MONTHS[Number(part({ month: 'numeric' })) - 1].slice(0, 3)
    : part({ month: 'short' }).replace('.', '')
  return { day: part({ day: 'numeric' }), month }
}

// Same instant, written the way the chosen language writes dates.
export function formatDate(language, value, options) {
  const instant = new Date(value)
  if (language === 'kk') return formatKazakhDate(instant, options)
  return new Intl.DateTimeFormat(LOCALES[language] ?? LOCALES[DEFAULT_LANGUAGE], options).format(instant)
}
