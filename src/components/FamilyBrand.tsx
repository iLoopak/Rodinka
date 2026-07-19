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
  onOpenGame?: () => void
  openGameLabel?: string
}

export function FamilyBrand({
  familyName,
  members,
  activeMemberId = null,
  animationMode = 'idle',
  loading = false,
  markLoading = loading,
  onOpenGame,
  openGameLabel,
}: FamilyLogoProps) {
  const label = formatFamilyBrand(loading ? null : familyName, t.appName)

  const mark = <FamilyMark
    variant="dynamic"
    members={members}
    size={38}
    loading={markLoading}
    activeMemberId={activeMemberId}
    animationMode={animationMode}
  />
  const lockup = <span className="brand-lockup family-brand-lockup">
    <span className="wordmark">{label.productName}</span>
    {label.householdName && <span className="household-name" title={label.householdName}>{label.householdName}</span>}
  </span>

  if (onOpenGame) return <div className="brand">
    <button
      type="button"
      className="family-brand-game-button"
      aria-label={openGameLabel ?? label.accessibleLabel}
      onClick={onOpenGame}
    >{mark}</button>
    {lockup}
  </div>

  return <div className="brand" aria-label={label.accessibleLabel}>
    {mark}
    {lockup}
  </div>
}
