import { getCurrentLanguage } from '../i18n'
import { localeFor } from '../i18n/language'
import { t } from '../strings'
import { toUTCDate } from './dueDate'

export function calendarDayAriaLabel(date: string, itemCount: number, options?: { today?: boolean; selected?: boolean }) {
  const formatted = toUTCDate(date).toLocaleDateString(localeFor(getCurrentLanguage()), {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
  return [formatted, t.calendar.itemCount(itemCount), options?.today ? t.calendar.dayToday : '', options?.selected ? t.calendar.daySelected : '']
    .filter(Boolean).join(', ')
}
