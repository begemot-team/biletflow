import { useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n/i18n.js'

// Modal-style card from the Register/Login wireframes: header with the title on
// the left and a round close button on the right, inside the card.
export default function AuthCard({ title, children, footer }) {
  const { t } = useI18n()
  const navigate = useNavigate()

  return (
    <div className="fixed inset-0 z-10 flex overflow-y-auto bg-black/40 p-4">
      {/* m-auto, not items-center: a card taller than the screen must stay scrollable from its top */}
      <div className="m-auto w-full max-w-sm overflow-hidden rounded-lg bg-white shadow-xl">
        <header className="flex items-center justify-between gap-4 border-b border-gray-200 px-8 py-5">
          <h2 className="text-2xl font-semibold">{title}</h2>
          <button
            type="button"
            aria-label={t('Close')}
            onClick={() => navigate('/')}
            className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-black focus-visible:outline-2 focus-visible:outline-indigo-500"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </header>
        <div className="space-y-5 px-8 py-6">{children}</div>
        {footer && <p className="px-8 pb-6 text-center text-sm">{footer}</p>}
      </div>
    </div>
  )
}

export function Field({ label, error, className = '', ...props }) {
  const { t } = useI18n()
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <input
        {...props}
        placeholder={label}
        aria-invalid={Boolean(error)}
        className={`w-full rounded border bg-white px-3 py-2.5 text-gray-900 placeholder:text-gray-500 focus:outline-2 focus:outline-indigo-500 ${error ? 'border-red-500' : 'border-gray-300'} ${className}`}
      />
      {error && <span className="mt-1 block text-sm text-red-600">{t(error)}</span>}
    </label>
  )
}
