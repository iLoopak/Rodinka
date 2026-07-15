import { useMemo } from 'react'
import type { FamilyMember } from '../../hooks/useFamilyMembers'
import { t } from '../../strings'
import type { CalendarEntry } from '../../utils/calendarEntries'
import { getItemTypeStyle } from '../../utils/itemTypeStyle'
import { buildMonthWeeks } from '../../utils/monthGrid'
import { MemberAvatar } from '../ui/MemberAvatar'

function weekdayLabels() { return [
  t.calendar.weekdayShortMon,
  t.calendar.weekdayShortTue,
  t.calendar.weekdayShortWed,
  t.calendar.weekdayShortThu,
  t.calendar.weekdayShortFri,
  t.calendar.weekdayShortSat,
  t.calendar.weekdayShortSun,
] }

const MAX_INDICATORS_PER_DAY = 3

interface Props {
  monthAnchor: string
  entries: CalendarEntry[]
  today: string
  selectedDay?: string | null
  memberById: (id: string) => FamilyMember | undefined
  onSelectDay: (day: string) => void
}

export function MonthGrid({ monthAnchor, entries, today, selectedDay, memberById, onSelectDay }: Props) {
  const weeks = useMemo(() => buildMonthWeeks(monthAnchor), [monthAnchor])
  const currentMonth = monthAnchor.slice(0, 7)

  const entriesByDay = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>()
    for (const entry of entries) {
      const list = map.get(entry.date)
      if (list) list.push(entry)
      else map.set(entry.date, [entry])
    }
    return map
  }, [entries])

  return (
    <div className="month-grid">
      <div className="month-grid-row month-grid-header">
        {weekdayLabels().map((label) => <div key={label} className="month-grid-weekday">{label}</div>)}
      </div>
      {weeks.map((week) => (
        <div className="month-grid-row" key={week[0]}>
          {week.map((day) => {
            const dayEntries = entriesByDay.get(day) ?? []
            const inMonth = day.slice(0, 7) === currentMonth
            const isToday = day === today
            const isSelected = day === selectedDay
            const visible = dayEntries.slice(0, MAX_INDICATORS_PER_DAY)
            const overflow = dayEntries.length - visible.length

            return (
              <button
                type="button"
                key={day}
                className={`month-grid-day${inMonth ? '' : ' outside'}${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`}
                onClick={() => onSelectDay(day)}
                aria-pressed={isSelected}
                aria-label={`${day}${dayEntries.length > 0 ? ` — ${dayEntries.length}` : ''}`}
              >
                <span className="month-grid-day-number">{Number(day.slice(8, 10))}</span>
                {dayEntries.length > 0 && (
                  <span className="month-grid-day-dots">
                    {visible.map((entry) => {
                      const style = getItemTypeStyle(entry.type)
                      const personId = entry.childOrPatientId ?? entry.responsibleMemberId
                      return (
                        <span
                          key={entry.id}
                          className={`month-grid-indicator${personId ? ' has-member' : ''}`}
                          style={{
                            backgroundColor: `var(${style.surfaceVar})`,
                            borderColor: `var(${style.colorVar})`,
                            color: `var(${style.colorVar})`,
                          }}
                          title={`${style.label}: ${entry.title}`}
                        >
                          {personId
                            ? <MemberAvatar member={memberById(personId)} size={15} forceInitials />
                            : <span className="month-grid-indicator-dot" />}
                        </span>
                      )
                    })}
                    {overflow > 0 && <span className="month-grid-more">+{overflow}</span>}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
