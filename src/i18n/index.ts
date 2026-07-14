import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { applyLanguage, browserLanguage, type Language } from './language'

const initialLanguage = browserLanguage()

void i18next.use(initReactI18next).init({
  lng: initialLanguage,
  fallbackLng: 'en',
  supportedLngs: ['cs', 'en'],
  nonExplicitSupportedLngs: true,
  interpolation: { escapeValue: false },
  resources: {
    cs: { translation: { languageName: 'Čeština' } },
    en: { translation: { languageName: 'English' } },
  },
  saveMissing: import.meta.env.DEV,
  missingKeyHandler: (_languages, _namespace, key) => {
    if (import.meta.env.DEV) console.warn(`[i18n] Missing translation: ${key}`)
  },
})

applyLanguage(initialLanguage)

function notifyServiceWorker(language: Language) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  void navigator.serviceWorker.ready.then((registration) => {
    registration.active?.postMessage({ type: 'APP_LOCALE', locale: language })
  }).catch(() => undefined)
}

notifyServiceWorker(initialLanguage)

i18next.on('languageChanged', (nextLanguage) => {
  const language = nextLanguage === 'cs' ? 'cs' : 'en'
  applyLanguage(language)
  notifyServiceWorker(language)
})

export function getCurrentLanguage(): Language {
  return i18next.resolvedLanguage === 'cs' || i18next.language === 'cs' ? 'cs' : 'en'
}

export async function changeLanguage(language: Language) {
  await i18next.changeLanguage(language)
}

export { i18next }
