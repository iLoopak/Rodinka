import type { FamilyMember } from '../../hooks/useFamilyMembers'
import { MemberAvatar } from './MemberAvatar'

export interface PersonRole {
  member?: FamilyMember
  fallbackName?: string
  label: string
}

const AVATAR_SIZE = { compact: 24, default: 36, large: 56 } as const

interface Props {
  roles: PersonRole[]
  /** 'large' is for a detail modal's own prominent people block; 'compact' for dense list rows. */
  size?: keyof typeof AVATAR_SIZE
}

export function PersonRoleGroup({ roles, size = 'default' }: Props) {
  const grouped = new Map<string, { member?: FamilyMember; name: string; labels: string[] }>()
  for (const role of roles) {
    const name = role.member?.display_name ?? role.fallbackName ?? '?'
    const key = role.member?.id ?? `name:${name}`
    const current = grouped.get(key)
    if (current) current.labels.push(role.label)
    else grouped.set(key, { member: role.member, name, labels: [role.label] })
  }

  return <div className={`person-role-group${size !== 'default' ? ` ${size}` : ''}`}>
    {[...grouped.entries()].map(([key, person]) => <div className="person-role" key={key}>
      <MemberAvatar member={person.member} size={AVATAR_SIZE[size]} />
      <span><strong>{person.name}</strong><small>{person.labels.join(' · ')}</small></span>
    </div>)}
  </div>
}
