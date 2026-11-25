import { Link } from 'react-router-dom'
import { useAuth } from './auth'
import RequireAuth from './RequireAuth.jsx'
import { useI18n } from '../i18n/i18n.js'

function OrganizerOnly({ children }) {
  const { t } = useI18n()
  const { isOrganizer } = useAuth()

  if (!isOrganizer) {
    return (
      <main className="mx-auto max-w-xl px-6 py-20 text-center">
        <h2 className="text-2xl font-semibold">{t('Organizer account required')}</h2>
        <p className="mt-4 text-gray-600">
          {t('Only organizer accounts can create events.')}{' '}
          <Link to="/register" className="text-brand-700 underline">
            {t('Register as an organizer')}
          </Link>
        </p>
      </main>
    )
  }
  return children
}

export default function RequireOrganizer({ children }) {
  return (
    <RequireAuth>
      <OrganizerOnly>{children}</OrganizerOnly>
    </RequireAuth>
  )
}
