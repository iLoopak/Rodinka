import { t } from '../strings'
import { formatFamilyBrand } from '../utils/familyBrand'
import type { FamilyMember } from '../hooks/useFamilyMembers'
import { FamilyMark, type FamilyLogoAnimationMode } from './FamilyMark'

export type { FamilyLogoAnimationMode } from './FamilyMark'

export interface FamilyLogoProps {
  familyName: string | null
  members: Array<Pick<FamilyMember, 'id' | 'color_key' | 'custom_color'>>
  activeMemberId?: string | null
  animationMode?: FamilyLogoAnimationMode
  loading?: boolean
  markLoading?: boolean
}

export function FamilyBrand({
  familyName,
  members,
  activeMemberId = null,
  animationMode = 'idle',
  loading = false,
  markLoading = loading,
}: FamilyLogoProps) {
  const label = formatFamilyBrand(loading ? null : familyName, t.appName)

  return <div className="brand" aria-label={label.accessibleLabel}>
    <FamilyMark
      variant="dynamic"
      members={members}
      size={38}
      loading={markLoading}
      activeMemberId={activeMemberId}
      animationMode={animationMode}
    />
    <span className="brand-lockup family-brand-lockup">
      <span className="wordmark">{label.productName}</span>
      {label.householdName && <span className="household-name" title={label.householdName}>{label.householdName}</span>}
    </span>
  </div>
}
