import { normalizeLanguage } from './translate.js'

const KEY = 'biletflow.language'

// The choice is kept in localStorage, so it survives a reload and a new tab.
export function savedLanguage() {
  try { return normalizeLanguage(localStorage.getItem(KEY)) } catch { return normalizeLanguage(null) }
}

export function saveLanguage(language) {
  try { localStorage.setItem(KEY, language) } catch { /* Storage may be disabled. */ }
}
