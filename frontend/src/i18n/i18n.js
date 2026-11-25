import { createContext, useContext } from 'react'

export const LanguageContext = createContext(null)

// { language, setLanguage, t, date }
export function useI18n() {
  return useContext(LanguageContext)
}
