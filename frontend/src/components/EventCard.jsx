import { Link } from 'react-router-dom'
import { useI18n } from '../i18n/i18n.js'
import { formatDayMonth } from '../i18n/translate.js'
import { categoryColors } from '../utils/categoryColors'

// Event in a list, drawn as a ticket: a date stub in the category color and the
// details. Pointing at it tears the stub off.
export default function EventCard({ event, order = 0 }) {
  const { t, language } = useI18n()
  const colors = categoryColors(event.category)
  const { day, month } = formatDayMonth(language, event.starts_at)

  return (
    <Link to={`/events/${event.id}`} style={{ animationDelay: `${Math.min(order, 8) * 60}ms` }}
      className="group flex min-h-32 animate-rise rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500 motion-reduce:animate-none">
      <span className={`flex w-20 shrink-0 flex-col items-center justify-center rounded-l-xl border-r-2 border-dashed border-white text-white transition-transform duration-300 motion-safe:group-hover:-translate-x-1 motion-safe:group-hover:-rotate-3 motion-safe:group-focus-visible:-translate-x-1 motion-safe:group-focus-visible:-rotate-3 ${colors.solid}`}>
        <span className="text-3xl leading-none font-bold">{day}</span>
        <span className="mt-1 text-sm">{month}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start rounded-r-xl border border-l-0 bg-white p-5 transition duration-300 group-hover:shadow-lg motion-safe:group-hover:translate-x-1">
        {event.category && (
          <span className={`mb-2 rounded-full px-2.5 py-0.5 text-xs font-medium ${colors.soft}`}>{t(event.category)}</span>
        )}
        <h4 className="text-lg leading-snug font-semibold wrap-anywhere group-hover:text-brand-700">{event.title}</h4>
        <span className="mt-1 text-gray-600">{event.venue}</span>
      </span>
    </Link>
  )
}
