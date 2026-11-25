import { useEffect, useMemo, useState } from 'react'
import { LanguageContext } from './i18n.js'
import { formatDate, normalizeLanguage, translate } from './translate.js'

const KEY = 'biletflow.language'

function savedLanguage() {
  try { return normalizeLanguage(localStorage.getItem(KEY)) } catch { return normalizeLanguage(null) }
}

// The choice is kept in localStorage, so it survives a reload and a new tab.
export default function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(savedLanguage)

  useEffect(() => {
    document.documentElement.lang = language // screen readers pick the right voice
    try { localStorage.setItem(KEY, language) } catch { /* Storage may be disabled. */ }
  }, [language])

  const value = useMemo(() => ({
    language,
    setLanguage: (next) => setLanguage(normalizeLanguage(next)),
    t: (text, values) => translate(language, text, values),
    date: (instant, options) => formatDate(language, instant, options),
  }), [language])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
