import { useEffect, useMemo, useRef } from 'react'
import type { FamilyMember } from '../../hooks/useFamilyMembers'
import { t } from '../../strings'
import { getCurrentLanguage } from '../../i18n'
import type { CalendarEntry } from '../../utils/calendarEntries'
import { formatShortDate } from '../../utils/dueDate'
import {
  formatCalendarWeekLabel,
  formatWeekDayHeading,
  groupEntriesForWeek,
  memberIdsForCalendarEntries,
  shiftWeek,
} from '../../utils/weekCalendar'
import { MemberAvatar } from '../ui/MemberAvatar'
import { WeekCalendarEntryRow } from './WeekCalendarEntryRow'

function weekdayLabels() { return [
  t.calendar.weekdayShortMon, t.calendar.weekdayShortTue, t.calendar.weekdayShortWed,
  t.calendar.weekdayShortThu, t.calendar.weekdayShortFri, t.calendar.weekdayShortSat,
  t.calendar.weekdayShortSun,
] }

interface Props {
  weekStart: string
  entries: CalendarEntry[]
  today: string
  selectedDay: string
  scrollVersion: number
  memberById: (id: string) => FamilyMember | undefined
  onChangeWeek: (weekStart: string) => void
  onSelectDay: (date: string) => void
  onSelectEntry: (entry: CalendarEntry) => void
  onChangeAssignment: (entry: CalendarEntry) => void
  onAddDay: (date: string) => void
}

export function WeekAgenda({ weekStart, entries, today, selectedDay, scrollVersion, memberById, onChangeWeek, onSelectDay, onSelectEntry, onChangeAssignment, onAddDay }: Props) {
  const locale = getCurrentLanguage()
  const days = useMemo(() => groupEntriesForWeek(entries, weekStart), [entries, weekStart])
  const sectionRefs = useRef(new Map<string, HTMLElement>())

  function scrollToDay(date: string) {
    const section = sectionRefs.current.get(date)
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.setTimeout(() => section?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true }), 250)
  }

  useEffect(() => {
    if (scrollVersion > 0) scrollToDay(selectedDay)
  }, [scrollVersion, selectedDay])

  function selectDay(date: string) {
    onSelectDay(date)
    window.requestAnimationFrame(() => scrollToDay(date))
  }

  return <div className="week-calendar">
    <div className="month-nav week-nav">
      <button type="button" className="btn-secondary" onClick={() => onChangeWeek(shiftWeek(weekStart, -1))} aria-label={t.calendar.previousWeek}>‹</button>
      <span className="month-nav-label">{formatCalendarWeekLabel(weekStart, locale)}</span>
      <button type="button" className="btn-secondary" onClick={() => onChangeWeek(shiftWeek(weekStart, 1))} aria-label={t.calendar.nextWeek}>›</button>
    </div>

    <div className="week-strip" aria-label={t.calendar.viewWeek}>
      {days.map((day, index) => {
        const memberIds = memberIdsForCalendarEntries(day.entries)
        const isToday = day.date === today
        const selected = day.date === selectedDay
        return <button
          type="button"
          key={day.date}
          className={`week-strip-day${isToday ? ' today' : ''}${selected ? ' selected' : ''}${index >= 5 ? ' weekend' : ''}${day.entries.length ? ' has-events' : ''}`}
          aria-pressed={selected}
          aria-label={`${formatWeekDayHeading(day.date, locale)}, ${t.calendar.itemCount(day.entries.length)}`}
          onClick={() => selectDay(day.date)}
        >
          <span className="week-strip-weekday">{weekdayLabels()[index]}</span>
          <span className="week-strip-number">{Number(day.date.slice(8, 10))}</span>
          <span className="week-strip-indicators" aria-hidden="true">
            {memberIds.slice(0, 2).map((id) => <MemberAvatar key={id} member={memberById(id)} size={14} />)}
            {memberIds.length > 2 && <span className="week-strip-more">+{memberIds.length - 2}</span>}
            {memberIds.length === 0 && day.entries.length > 0 && <span className="week-strip-dot" />}
          </span>
          {day.entries.length > 0 && <span className="week-strip-count">{day.entries.length}</span>}
        </button>
      })}
    </div>

    <div className="week-day-list">
      {days.map((day) => {
        const memberIds = memberIdsForCalendarEntries(day.entries)
        const isToday = day.date === today
        return <section
          key={day.date}
          ref={(node) => { if (node) sectionRefs.current.set(day.date, node); else sectionRefs.current.delete(day.date) }}
          className={`week-day-card${isToday ? ' today' : ''}${selectedDay === day.date ? ' selected' : ''}`}
          data-week-date={day.date}
          aria-labelledby={`week-day-${day.date}`}
        >
          <header className="week-day-header">
            <div>
              <h2 id={`week-day-${day.date}`} tabIndex={-1}>{formatWeekDayHeading(day.date, locale)}</h2>
              <p>{isToday && <span className="today-badge">{t.calendar.todayBadge}</span>}{t.calendar.itemCount(day.entries.length)}</p>
            </div>
            {memberIds.length > 0 && <span className="avatar-stack week-day-avatars" aria-label={memberIds.map((id) => memberById(id)?.display_name).filter(Boolean).join(', ')}>
              {memberIds.slice(0, 3).map((id) => <MemberAvatar key={id} member={memberById(id)} size={26} />)}
              {memberIds.length > 3 && <span className="avatar-more">+{memberIds.length - 3}</span>}
            </span>}
          </header>

          {day.entries.length === 0 ? <div className="week-day-empty"><span>{t.calendar.nothingPlanned}</span><button type="button" className="week-day-add-small" onClick={() => onAddDay(day.date)} aria-label={`${t.create.addThisDayAction}: ${formatShortDate(day.date)}`}>+</button></div>
            : <div className="week-day-groups">
              {day.untimed.length > 0 && <div className="week-day-group"><h3>{t.calendar.untimedGroup}</h3><ul>{day.untimed.map((entry) => <WeekCalendarEntryRow key={entry.id} entry={entry} memberById={memberById} onClick={() => onSelectEntry(entry)} onAssignmentClick={() => onChangeAssignment(entry)} />)}</ul></div>}
              {day.timed.length > 0 && <div className="week-day-group"><h3>{t.calendar.timedGroup}</h3><ul>{day.timed.map((entry) => <WeekCalendarEntryRow key={entry.id} entry={entry} memberById={memberById} onClick={() => onSelectEntry(entry)} onAssignmentClick={() => onChangeAssignment(entry)} />)}</ul></div>}
              <button type="button" className="link week-day-add" onClick={() => onAddDay(day.date)}>+ {t.create.addThisDayAction}</button>
            </div>}
        </section>
      })}
    </div>
  </div>
}

