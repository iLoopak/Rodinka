import { getCurrentLanguage } from '../i18n'
import { localeFor } from '../i18n/language'

/**
 * Short date for a picker row: "14. 7." in Czech, "Jul 14" in English.
 *
 * Accepts the plain `YYYY-MM-DD` shape the chore/activity tables store.
 * Those are calendar dates, not instants, so they are parsed as local
 * components — `new Date('2026-07-14')` would be parsed as UTC midnight and
 * render as the 13th for anyone west of Greenwich.
 */
export function formatEntityPickerDate(value: string, language = getCurrentLanguage()): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return ''
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(localeFor(language), { day: 'numeric', month: 'numeric' }).format(date)
}
