import { useEffect, useMemo, useState } from 'react'
import { LanguageContext } from './i18n.js'
import { saveLanguage, savedLanguage } from './savedLanguage.js'
import { formatDate, normalizeLanguage, translate } from './translate.js'

export default function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(savedLanguage)

  useEffect(() => {
    document.documentElement.lang = language // screen readers pick the right voice
    saveLanguage(language)
  }, [language])

  const value = useMemo(() => ({
    language,
    setLanguage: (next) => setLanguage(normalizeLanguage(next)),
    t: (text, values) => translate(language, text, values),
    date: (instant, options) => formatDate(language, instant, options),
  }), [language])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
