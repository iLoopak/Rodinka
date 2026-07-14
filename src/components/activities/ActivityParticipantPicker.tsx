import type { FamilyMember } from '../../hooks/useFamilyMembers'
import { t } from '../../strings'
import { selectWholeFamily, toggleMemberSelection } from '../../utils/activityFormModel'
import { MemberAvatar } from '../ui/MemberAvatar'

interface Props {
  members: FamilyMember[]
  selectedIds: string[]
  invalid?: boolean
  onChange: (ids: string[]) => void
}

function firstName(displayName: string) {
  return displayName.trim().split(/\s+/)[0] || displayName
}

export function ActivityParticipantPicker({ members, selectedIds, invalid = false, onChange }: Props) {
  const allSelected = members.length > 0 && members.every((member) => selectedIds.includes(member.id))

  return <div className="activity-participants">
    <div className="activity-field-heading">
      <span>{t.activities.participantsLabel}</span>
      <button
        type="button"
        className={`activity-family-toggle${allSelected ? ' active' : ''}`}
        aria-pressed={allSelected}
        onClick={() => onChange(allSelected ? [] : selectWholeFamily(members.map((member) => member.id)))}
      >{t.activities.wholeFamily}</button>
    </div>
    <div className="participant-chip-grid" role="group" aria-label={t.activities.participantsLabel} aria-invalid={invalid || undefined}>
      {members.map((member) => {
        const selected = selectedIds.includes(member.id)
        return <button
          key={member.id}
          type="button"
          className={`participant-chip${selected ? ' selected' : ''}`}
          aria-pressed={selected}
          aria-label={member.display_name}
          onClick={() => onChange(toggleMemberSelection(selectedIds, member.id))}
        >
          <MemberAvatar member={member} size={30} />
          <span>{firstName(member.display_name)}</span>
          <span className="participant-chip-check" aria-hidden="true">✓</span>
        </button>
      })}
    </div>
  </div>
}
