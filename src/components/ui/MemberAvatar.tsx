import { useState } from 'react'
import { memberColorVar, memberInitials } from '../../utils/memberColor'
import type { FamilyMember } from '../../hooks/useFamilyMembers'

interface Props {
  member: Pick<FamilyMember, 'id' | 'display_name' | 'color_key' | 'avatar_url'> | null | undefined
  size?: number
  decorative?: boolean
  forceInitials?: boolean
}

export function MemberAvatar({ member, size = 26, decorative = true, forceInitials = false }: Props) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  if (!member) return null
  const showPhoto = Boolean(!forceInitials && member.avatar_url && failedUrl !== member.avatar_url)

  return (
    <span
      className={`member-avatar${showPhoto ? ' has-photo' : ''}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        backgroundColor: `var(${memberColorVar(member)})`,
        borderColor: `var(${memberColorVar(member)})`,
      }}
      title={member.display_name}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : member.display_name}
      aria-hidden={decorative || undefined}
    >
      {showPhoto && (
        <img
          className="member-avatar-image"
          src={member.avatar_url ?? undefined}
          alt=""
          onError={() => setFailedUrl(member.avatar_url)}
        />
      )}
      {!showPhoto && memberInitials(member.display_name)}
    </span>
  )
}
