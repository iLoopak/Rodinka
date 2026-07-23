import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { applyResolvedTheme, readStoredThemePreference, resolveTheme, writeStoredThemePreference, type ThemePreference } from './theme'
import { ThemeContext } from './themeContext'

function systemPrefersDark() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(() => readStoredThemePreference(typeof window === 'undefined' ? undefined : window.localStorage))
  const [systemDark, setSystemDark] = useState(systemPrefersDark)
  const resolvedTheme = resolveTheme(preference, systemDark)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setSystemDark(query.matches)
    update()
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    applyResolvedTheme(resolvedTheme, document)
  }, [resolvedTheme])

  const setThemePreference = (next: ThemePreference) => {
    setPreference(next)
    writeStoredThemePreference(typeof window === 'undefined' ? undefined : window.localStorage, next)
  }

  const value = useMemo(() => ({ preference, resolvedTheme, setThemePreference }), [preference, resolvedTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

