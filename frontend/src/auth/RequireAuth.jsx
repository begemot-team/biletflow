import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './auth'
import { useI18n } from '../i18n/i18n.js'

// Sends signed-out visitors to the login modal and back here afterwards
// (query string included, so a Campaign QR promo code survives the detour).
export default function RequireAuth({ children }) {
  const { t } = useI18n()
  const { user, ready } = useAuth()
  const location = useLocation()

  if (!ready) return <p className="mx-auto max-w-3xl px-6 py-20">{t('Loading…')}</p>
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return children
}
