import { t } from '../../strings'
import { getItemTypeStyle } from '../../utils/itemTypeStyle'
import { onActivateKey } from '../../utils/a11y'
import { DueBadge } from '../ui/DueBadge'
import { MemberAvatar } from '../ui/MemberAvatar'
import type { CalendarEntry } from '../../utils/calendarEntries'

interface Props {
  entry: CalendarEntry
  memberName: (id: string) => string
  onClick: () => void
}

// Shared row rendering reused by the agenda view and the month view's
// per-day detail list — one place for "how a calendar item looks",
// combining icon + color + text label + person marker so type is never
// conveyed by color alone.
export function CalendarEntryRow({ entry, memberName, onClick }: Props) {
  const style = getItemTypeStyle(entry.type)
  const personId = entry.childOrPatientId ?? entry.responsibleMemberId
  const showResponsible =
    entry.responsibleMemberId && entry.responsibleMemberId !== entry.childOrPatientId

  return (
    <li
      className="clickable-row calendar-entry-row"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={onActivateKey(onClick)}
    >
      <span className="calendar-entry-icon" style={{ color: `var(${style.colorVar})` }}>
        {style.icon}
      </span>
      {personId && <MemberAvatar member={{ id: personId, display_name: memberName(personId) }} size={22} />}
      <span className="row-title">{entry.title}</span>
      <span className="row-meta">{style.label}</span>
      {showResponsible && entry.responsibleMemberId && (
        <span className="row-meta">{t.calendar.responsibleLabel(memberName(entry.responsibleMemberId))}</span>
      )}
      <span className="row-spacer" />
      {entry.time && <span className="row-meta font-tabular">{entry.time.slice(0, 5)}</span>}
      <DueBadge dueDate={entry.date} />
    </li>
  )
}
