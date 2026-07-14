import { t } from '../../strings'
import { onActivateKey } from '../../utils/a11y'
import type { CalendarEntry } from '../../utils/calendarEntries'
import { getItemTypeStyle } from '../../utils/itemTypeStyle'
import { mealSlotLabel } from '../../utils/mealLabels'
import { MemberAvatar } from '../ui/MemberAvatar'
import type { FamilyMember } from '../../hooks/useFamilyMembers'

interface Props {
  entries: CalendarEntry[]
  memberById: (id: string) => FamilyMember | undefined
  onSelectEntry: (entry: CalendarEntry) => void
}

function peopleLabel(entry: CalendarEntry, memberById: (id: string) => FamilyMember | undefined): string {
  const person = entry.childOrPatientId ? memberById(entry.childOrPatientId)?.display_name : null
  const responsible = entry.responsibleMemberId ? memberById(entry.responsibleMemberId)?.display_name : null

  if (entry.sourceType === 'chore') {
    return person ? t.today.choreAssignee(person) : t.today.personUnassigned
  }
  if (entry.sourceType === 'meal') {
    return responsible ? t.today.mealResponsible(responsible) : t.today.mealUnassigned
  }
  if (entry.sourceType === 'activity') {
    if (person && responsible && person !== responsible) return t.today.activityPeople(person, responsible)
    return person ?? responsible ?? t.today.personUnassigned
  }
  if (entry.sourceType === 'medical' || entry.sourceType === 'medical_due') {
    if (person && responsible && person !== responsible) return t.today.medicalPeople(person, responsible)
    return person ?? responsible ?? t.today.personUnassigned
  }
  if (person && responsible && person !== responsible) return t.today.responsiblePeople(person, responsible)
  return person ?? responsible ?? t.today.personUnassigned
}

function whenLabel(entry: CalendarEntry): string {
  if (entry.time) return entry.time.slice(0, 5)
  if (entry.type === 'meal') return mealSlotLabel(entry.mealSlot ?? 'other')
  return t.due.today
}

export function TodayAgendaList({ entries, memberById, onSelectEntry }: Props) {
  return (
    <ul className="today-agenda-list">
      {entries.map((entry) => {
        const style = getItemTypeStyle(entry.type)
        const personId = entry.childOrPatientId ?? entry.responsibleMemberId
        const person = personId ? memberById(personId) : undefined
        const activate = () => onSelectEntry(entry)

        return (
          <li
            key={entry.id}
            className="today-agenda-item clickable-row"
            role="button"
            tabIndex={0}
            onClick={activate}
            onKeyDown={onActivateKey(activate)}
          >
            <span className="today-agenda-when font-tabular">{whenLabel(entry)}</span>
            <span className="today-agenda-icon" style={{ color: `var(${style.colorVar})` }}>
              {style.icon}
            </span>
            {personId && (
              <MemberAvatar member={person} size={26} />
            )}
            <span className="today-agenda-copy">
              <span className="today-agenda-title">{entry.title}</span>
              <span className="today-agenda-type">{style.label}</span>
              <span className="today-agenda-people">{peopleLabel(entry, memberById)}</span>
            </span>
            <span className="today-agenda-chevron" aria-hidden="true">›</span>
          </li>
        )
      })}
    </ul>
  )
}
