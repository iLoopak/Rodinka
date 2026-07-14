import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { changeLanguage, getCurrentLanguage, i18next } from './index'
import { LanguageContext } from './languageContext'

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState(getCurrentLanguage)

  useEffect(() => {
    const update = () => setLanguage(getCurrentLanguage())
    i18next.on('languageChanged', update)
    return () => { i18next.off('languageChanged', update) }
  }, [])

  const value = useMemo(() => ({ language, changeLanguage }), [language])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
