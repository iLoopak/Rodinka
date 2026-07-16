import type { FamilyMember } from '../../hooks/useFamilyMembers'
import { MemberAvatar } from './MemberAvatar'

export interface PersonRole {
  member?: FamilyMember
  fallbackName?: string
  label: string
}

export function PersonRoleGroup({ roles, compact = false }: { roles: PersonRole[]; compact?: boolean }) {
  const grouped = new Map<string, { member?: FamilyMember; name: string; labels: string[] }>()
  for (const role of roles) {
    const name = role.member?.display_name ?? role.fallbackName ?? '?'
    const key = role.member?.id ?? `name:${name}`
    const current = grouped.get(key)
    if (current) current.labels.push(role.label)
    else grouped.set(key, { member: role.member, name, labels: [role.label] })
  }

  return <div className={`person-role-group${compact ? ' compact' : ''}`}>
    {[...grouped.entries()].map(([key, person]) => <div className="person-role" key={key}>
      <MemberAvatar member={person.member} size={compact ? 24 : 36} />
      <span><strong>{person.name}</strong><small>{person.labels.join(' · ')}</small></span>
    </div>)}
  </div>
}
