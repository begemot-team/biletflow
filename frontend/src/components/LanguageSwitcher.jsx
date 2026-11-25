import { useI18n } from '../i18n/i18n.js'
import { LANGUAGES } from '../i18n/translate.js'

export default function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n()

  return (
    <div role="group" aria-label={t('Language')} className="flex overflow-hidden rounded border border-gray-300 text-sm">
      {LANGUAGES.map(({ code, label, name }) => (
        <button key={code} type="button" lang={code} title={name} aria-label={name} aria-pressed={language === code}
          onClick={() => setLanguage(code)}
          className={`px-2 py-1 ${language === code ? 'bg-black text-white' : 'bg-white text-gray-600 hover:text-black'}`}>
          {label}
        </button>
      ))}
    </div>
  )
}
