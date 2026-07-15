import type { FamilyMember } from '../../hooks/useFamilyMembers'
import { getCurrentLanguage } from '../../i18n'
import { t } from '../../strings'
import type { CalendarEntry } from '../../utils/calendarEntries'
import { formatShortDate } from '../../utils/dueDate'
import { formatWeekDayHeading } from '../../utils/weekCalendar'
import { WeekCalendarEntryRow } from './WeekCalendarEntryRow'

interface Props {
  date: string
  entries: CalendarEntry[]
  today: string
  selected?: boolean
  exposeWeekDate?: boolean
  sectionRef?: (node: HTMLElement | null) => void
  memberById: (id: string) => FamilyMember | undefined
  onSelectEntry: (entry: CalendarEntry) => void
  onChangeAssignment?: (entry: CalendarEntry) => void
  onAddDay: (date: string) => void
  onClose?: () => void
}

export function CalendarDayAgendaCard({ date, entries, today, selected = false, exposeWeekDate = false, sectionRef, memberById, onSelectEntry, onChangeAssignment, onAddDay, onClose }: Props) {
  const isToday = date === today
  const headingId = `calendar-day-${date}`
  const untimed = entries.filter((entry) => !entry.time)
  const timed = entries.filter((entry) => Boolean(entry.time))

  return <section
    ref={sectionRef}
    className={`week-day-card${isToday ? ' today' : ''}${selected ? ' selected' : ''}`}
    data-week-date={exposeWeekDate ? date : undefined}
    aria-labelledby={headingId}
  >
    <header className="week-day-header">
      <div>
        <h2 id={headingId} tabIndex={-1}>{formatWeekDayHeading(date, getCurrentLanguage())}</h2>
        <p>{isToday && <span className="today-badge">{t.calendar.todayBadge}</span>}{t.calendar.itemCount(entries.length)}</p>
      </div>
      {onClose && <button type="button" className="calendar-day-close" onClick={onClose} aria-label={t.calendar.close}>×</button>}
    </header>

    {entries.length === 0 ? <div className="week-day-empty">{t.calendar.nothingPlanned}</div>
      : <div className="week-day-groups">
        {untimed.length > 0 && <div className="week-day-group"><h3>{t.calendar.untimedGroup}</h3><ul>{untimed.map((entry) => <WeekCalendarEntryRow key={entry.id} entry={entry} memberById={memberById} onClick={() => onSelectEntry(entry)} onAssignmentClick={onChangeAssignment ? () => onChangeAssignment(entry) : undefined} />)}</ul></div>}
        {timed.length > 0 && <div className="week-day-group"><h3>{t.calendar.timedGroup}</h3><ul>{timed.map((entry) => <WeekCalendarEntryRow key={entry.id} entry={entry} memberById={memberById} onClick={() => onSelectEntry(entry)} onAssignmentClick={onChangeAssignment ? () => onChangeAssignment(entry) : undefined} />)}</ul></div>}
      </div>}
    <button type="button" className="link week-day-add" onClick={() => onAddDay(date)} aria-label={`${t.create.addThisDayAction}: ${formatShortDate(date)}`}>+ {t.create.addThisDayAction}</button>
  </section>
}
