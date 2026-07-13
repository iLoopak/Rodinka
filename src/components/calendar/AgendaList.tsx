import { t } from '../../strings'
import { groupEntriesForAgenda, type CalendarEntry } from '../../utils/calendarEntries'
import { CalendarEntryRow } from './CalendarEntryRow'

interface Props {
  entries: CalendarEntry[]
  today: string
  memberName: (id: string) => string
  onSelectEntry: (entry: CalendarEntry) => void
}

// The compact, mobile-preferred overview: entries grouped into
// overdue/today/tomorrow/this week/later buckets.
export function AgendaList({ entries, today, memberName, onSelectEntry }: Props) {
  const groups = groupEntriesForAgenda(entries, today)

  if (groups.length === 0) {
    return <p className="empty-state">{t.calendar.noEntries}</p>
  }

  return (
    <div className="agenda-list">
      {groups.map((group) => (
        <div key={group.bucket} className="agenda-group">
          <h3 className="agenda-group-label">{group.label}</h3>
          <ul className="section-list">
            {group.entries.map((entry) => (
              <CalendarEntryRow
                key={entry.id}
                entry={entry}
                memberName={memberName}
                onClick={() => onSelectEntry(entry)}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
