export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'rodinka.themePreference'
export const LIGHT_THEME_COLOR = '#FFF8F2'
export const DARK_THEME_COLOR = '#1E211C'

export function normalizeThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  return preference === 'system' ? (systemPrefersDark ? 'dark' : 'light') : preference
}

export function readStoredThemePreference(storage: Pick<Storage, 'getItem'> | undefined): ThemePreference {
  if (!storage) return 'system'
  try {
    return normalizeThemePreference(storage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'system'
  }
}

export function writeStoredThemePreference(storage: Pick<Storage, 'setItem'> | undefined, preference: ThemePreference): void {
  if (!storage) return
  try {
    storage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Best-effort local UI preference; private browsing storage failures must not break the app.
  }
}

export function applyResolvedTheme(theme: ResolvedTheme, doc: Document = document): void {
  doc.documentElement.dataset.theme = theme
  doc.documentElement.style.colorScheme = theme
  const meta = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) meta.content = theme === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR
}
