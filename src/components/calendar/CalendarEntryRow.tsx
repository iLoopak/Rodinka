import { t } from '../../strings'
import { getItemTypeStyle } from '../../utils/itemTypeStyle'
import { DueBadge } from '../ui/DueBadge'
import { ItemTypeIcon } from '../ui/ItemTypeIcon'
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
// per-day detail list. Urgency stays in the due badge rather than tinting
// the whole interactive row, so title and metadata retain clear contrast.
export function CalendarEntryRow({ entry, memberById, onClick, onAssignmentClick }: Props) {
  const style = getItemTypeStyle(entry.type)
  const participantIds = [...new Set([
    ...(entry.participantMemberIds ?? []),
    ...(entry.childOrPatientId ? [entry.childOrPatientId] : []),
  ])]
  const participantNames = participantIds.map((id) => memberById(id)?.display_name).filter(Boolean).join(', ')
  const responsible = entry.responsibleMemberId ? memberById(entry.responsibleMemberId) : undefined
  const showResponsible = responsible && !participantIds.includes(responsible.id)

  return (
    <li className="calendar-entry-row-shell">
      <button type="button" className="clickable-row calendar-entry-row" onClick={onClick}>
        <ItemTypeIcon type={entry.type} size={34} />
        <span className="calendar-entry-content">
          <strong className="row-title">{entry.title}</strong>
          <span className="calendar-entry-meta-line">
            <span>{style.label}</span>
            {participantNames && <>
              <span aria-hidden="true">·</span>
              <span className="calendar-entry-people">
                <span className="avatar-stack" aria-hidden="true">
                  {participantIds.slice(0, 2).map((id) => <MemberAvatar key={id} member={memberById(id)} size={18} />)}
                  {participantIds.length > 2 && <span className="avatar-more">+{participantIds.length - 2}</span>}
                </span>
                <span>{participantNames}</span>
              </span>
            </>}
          </span>
          {showResponsible && <span className="calendar-entry-meta-line">{t.calendar.responsibleLabel(responsible.display_name)}</span>}
        </span>
        <span className="calendar-entry-side">
          {entry.time && <span className="row-meta font-tabular">{entry.time.slice(0, 5)}</span>}
          {entry.isMultiDay && <span className="row-meta">{entry.rangeStart} – {entry.rangeEnd}</span>}
          <DueBadge dueDate={entry.date} completed={entry.completed} />
        </span>
      </button>
      {entry.assignmentSeriesType && onAssignmentClick && <button
        type="button"
        className="calendar-entry-assignment"
        aria-label={`${entry.assignmentSeriesType === 'activity' ? t.calendar.changeCompanion : t.calendar.changeAssignee}${entry.assignmentOverridden ? `. ${t.calendar.occurrenceOverrideBadge}` : ''}`}
        onClick={onAssignmentClick}
      >
        <MemberAvatar member={responsible} size={36} />
        {entry.assignmentOverridden && <span className="assignment-override-indicator" aria-hidden="true">↔</span>}
      </button>}
    </li>
  )
}
