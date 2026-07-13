import { memberColorVar, memberInitials } from '../../utils/memberColor'

interface Props {
  member: { id: string; display_name: string } | null | undefined
  size?: number
}

// Initials-in-a-circle avatar, colored deterministically per member id
// (see memberColor.ts) — no photo upload, keeps the identity-at-a-glance
// promise from the calendar spec without adding image handling.
export function MemberAvatar({ member, size = 26 }: Props) {
  if (!member) return null

  return (
    <span
      className="member-avatar"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        backgroundColor: `var(${memberColorVar(member.id)})`,
      }}
      title={member.display_name}
      aria-label={member.display_name}
    >
      {memberInitials(member.display_name)}
    </span>
  )
}
