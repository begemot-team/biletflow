import { NavLink, Outlet } from 'react-router-dom'
import { useI18n } from '../i18n/i18n.js'

const linkClass = ({ isActive }) =>
  `block rounded px-3 py-2 ${isActive ? 'bg-brand-600 font-semibold text-white' : 'text-gray-600 hover:bg-brand-100 hover:text-brand-800'}`

// Organizer dashboard shell: side navigation + the page in <Outlet />.
// Mirat's analytics views (SRS 4.15) get their own child route and link here.
export default function OrganizerLayout() {
  const { t } = useI18n()

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 md:flex-row">
      <nav aria-label={t('Organizer')} className="shrink-0 md:w-52">
        <ul className="flex flex-wrap gap-1 md:flex-col">
          <li><NavLink to="/organizer" end className={linkClass}>{t('Overview')}</NavLink></li>
          <li><NavLink to="/organizer/events" end className={linkClass}>{t('My events')}</NavLink></li>
          <li><NavLink to="/organizer/events/new" className={linkClass}>{t('Create event')}</NavLink></li>
          <li><NavLink to="/organizer/analytics" className={linkClass}>{t('Analytics')}</NavLink></li>
          <li><NavLink to="/organizer/history" className={linkClass}>{t('Event history')}</NavLink></li>
          <li><NavLink to="/support" className={linkClass}>{t('Support cases')}</NavLink></li>
          {/* Mirat's campaign portal is a separate page with its own login (main.jsx) */}
          <li>
            <a href="/organizer/campaigns/new" className={linkClass({ isActive: false })}>{t('Promo campaigns')} ↗</a>
          </li>
        </ul>
      </nav>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}
