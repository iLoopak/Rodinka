import { useMemo } from 'react'
import { t } from '../../strings'
import { buildMonthWeeks } from '../../utils/monthGrid'
import { getItemTypeStyle } from '../../utils/itemTypeStyle'
import type { CalendarEntry } from '../../utils/calendarEntries'

const WEEKDAY_LABELS = [
  t.calendar.weekdayShortMon,
  t.calendar.weekdayShortTue,
  t.calendar.weekdayShortWed,
  t.calendar.weekdayShortThu,
  t.calendar.weekdayShortFri,
  t.calendar.weekdayShortSat,
  t.calendar.weekdayShortSun,
]

const MAX_DOTS_PER_DAY = 3

interface Props {
  monthAnchor: string
  entries: CalendarEntry[]
  today: string
  onSelectDay: (day: string) => void
}

export function MonthGrid({ monthAnchor, entries, today, onSelectDay }: Props) {
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
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="month-grid-weekday">
            {label}
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div className="month-grid-row" key={week[0]}>
          {week.map((day) => {
            const dayEntries = entriesByDay.get(day) ?? []
            const inMonth = day.slice(0, 7) === currentMonth
            const isToday = day === today
            const visible = dayEntries.slice(0, MAX_DOTS_PER_DAY)
            const overflow = dayEntries.length - visible.length

            return (
              <button
                type="button"
                key={day}
                className={`month-grid-day${inMonth ? '' : ' outside'}${isToday ? ' today' : ''}`}
                onClick={() => onSelectDay(day)}
                aria-label={`${day}${dayEntries.length > 0 ? ` — ${dayEntries.length}` : ''}`}
              >
                <span className="month-grid-day-number">{Number(day.slice(8, 10))}</span>
                {dayEntries.length > 0 && (
                  <span className="month-grid-day-dots">
                    {visible.map((entry) => {
                      const style = getItemTypeStyle(entry.type)
                      return (
                        <span
                          key={entry.id}
                          className="month-grid-dot"
                          style={{ backgroundColor: `var(${style.colorVar})` }}
                        />
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
