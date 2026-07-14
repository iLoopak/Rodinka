export const SUPPORTED_LANGUAGES = ['cs', 'en'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

export const LANGUAGE_STORAGE_KEY = 'rodinka.language'

export function languageFromLocale(locale?: string | null): Language {
  return locale?.trim().toLowerCase().replace('_', '-').match(/^cs(?:-|$)/) ? 'cs' : 'en'
}

export function resolveInitialLanguage(
  storedLanguage?: string | null,
  browserLanguages: readonly string[] = [],
): Language {
  if (storedLanguage === 'cs' || storedLanguage === 'en') return storedLanguage
  return languageFromLocale(browserLanguages.find(Boolean))
}

export function browserLanguage(): Language {
  // Keep deterministic Czech rendering for SSR and non-browser tooling. Real
  // browsers still use the stored preference or locale detection below.
  if (typeof window === 'undefined') return 'cs'
  let stored: string | null = null
  try { stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY) } catch { /* storage may be unavailable */ }
  return resolveInitialLanguage(stored, navigator.languages?.length ? navigator.languages : [navigator.language])
}

interface LanguageEnvironment {
  documentElement?: { lang: string }
  storage?: Pick<Storage, 'setItem'>
}

export function applyLanguage(language: Language, environment?: LanguageEnvironment) {
  const documentElement = environment?.documentElement ?? (typeof document !== 'undefined' ? document.documentElement : undefined)
  const storage = environment?.storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined)
  if (documentElement) documentElement.lang = language
  if (storage) {
    try { storage.setItem(LANGUAGE_STORAGE_KEY, language) } catch { /* storage may be unavailable */ }
  }
}

export function localeFor(language: Language) {
  return language === 'cs' ? 'cs-CZ' : 'en-US'
}
