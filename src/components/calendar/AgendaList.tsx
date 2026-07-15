import { t } from '../../strings'
import { groupEntriesForAgenda, type CalendarEntry } from '../../utils/calendarEntries'
import { CalendarEntryRow } from './CalendarEntryRow'
import type { FamilyMember } from '../../hooks/useFamilyMembers'

interface Props {
  entries: CalendarEntry[]
  today: string
  memberById: (id: string) => FamilyMember | undefined
  onSelectEntry: (entry: CalendarEntry) => void
}

// The compact, mobile-preferred overview: entries grouped into
// overdue/today/tomorrow/this week/later buckets.
export function AgendaList({ entries, today, memberById, onSelectEntry }: Props) {
  const groups = groupEntriesForAgenda(entries, today)

  if (groups.length === 0) {
    return <p className="empty-state">{t.calendar.noEntries}</p>
  }

  return (
    <div className="agenda-list">
      {groups.map((group) => (
        <div key={group.bucket} className="agenda-group">
          <h3 className="agenda-group-label">{group.label}</h3>
          <ul className="section-list agenda-group-list">
            {group.entries.map((entry) => (
              <CalendarEntryRow
                key={entry.id}
                entry={entry}
                memberById={memberById}
                onClick={() => onSelectEntry(entry)}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
