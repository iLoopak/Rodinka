import { t } from '../../strings'
import { getItemTypeStyle } from '../../utils/itemTypeStyle'
import { DueBadge } from '../ui/DueBadge'
import { MemberAvatar } from '../ui/MemberAvatar'
import type { CalendarEntry } from '../../utils/calendarEntries'
import type { FamilyMember } from '../../hooks/useFamilyMembers'

interface Props {
  entry: CalendarEntry
  memberById: (id: string) => FamilyMember | undefined
  onClick: () => void
  onAssignmentClick?: () => void
}

// Shared row rendering reused by the agenda view and the month view's
// per-day detail list — one place for "how a calendar item looks",
// combining icon + color + text label + person marker so type is never
// conveyed by color alone.
export function CalendarEntryRow({ entry, memberById, onClick, onAssignmentClick }: Props) {
  const style = getItemTypeStyle(entry.type)
  const personId = entry.childOrPatientId ?? entry.responsibleMemberId
  const person = personId ? memberById(personId) : undefined
  const showResponsible =
    entry.responsibleMemberId && entry.responsibleMemberId !== entry.childOrPatientId

  return (
    <li className="calendar-entry-row-shell">
      <button type="button" className="clickable-row calendar-entry-row" onClick={onClick}>
      <span className="calendar-entry-icon" style={{ color: `var(${style.colorVar})` }}>
        {style.icon}
      </span>
      {(entry.participantMemberIds?.length ?? 0) > 1 ? <span className="avatar-stack">
        {entry.participantMemberIds!.slice(0, 3).map((id) => <MemberAvatar key={id} member={memberById(id)} size={22} />)}
        {entry.participantMemberIds!.length > 3 && <span className="avatar-more">+{entry.participantMemberIds!.length - 3}</span>}
      </span> : personId && <MemberAvatar member={person} size={22} />}
      <span className="row-title">{entry.title}</span>
      <span className="row-meta">{style.label}</span>
      {showResponsible && entry.responsibleMemberId && (
        <span className="row-meta">
          {t.calendar.responsibleLabel(memberById(entry.responsibleMemberId)?.display_name ?? '?')}
        </span>
      )}
      <span className="row-spacer" />
      {entry.time && <span className="row-meta font-tabular">{entry.time.slice(0, 5)}</span>}
      {entry.isMultiDay && <span className="row-meta">{entry.rangeStart} – {entry.rangeEnd}</span>}
      <DueBadge dueDate={entry.date} />
      </button>
      {entry.assignmentSeriesType && onAssignmentClick && <button
        type="button"
        className="calendar-entry-assignment"
        aria-label={`${entry.assignmentSeriesType === 'activity' ? t.calendar.changeCompanion : t.calendar.changeAssignee}${entry.assignmentOverridden ? `. ${t.calendar.occurrenceOverrideBadge}` : ''}`}
        onClick={onAssignmentClick}
      >
        <MemberAvatar member={entry.responsibleMemberId ? memberById(entry.responsibleMemberId) : undefined} size={24} />
        {entry.assignmentOverridden && <span aria-hidden="true">↔</span>}
      </button>}
    </li>
  )
}
