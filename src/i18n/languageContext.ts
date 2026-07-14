import { createContext, useContext } from 'react'
import type { Language } from './language'

export interface LanguageContextValue {
  language: Language
  changeLanguage: (language: Language) => Promise<void>
}

export const LanguageContext = createContext<LanguageContextValue | null>(null)

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) throw new Error('useLanguage must be used within LanguageProvider')
  return context
}
