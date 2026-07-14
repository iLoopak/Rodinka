import { t } from '../strings'
import { formatFamilyBrand } from '../utils/familyBrand'
import type { FamilyMember } from '../hooks/useFamilyMembers'
import { FamilyMark } from './FamilyMark'

interface Props {
  familyName: string | null
  members: Array<Pick<FamilyMember, 'id' | 'color_key'>>
  loading?: boolean
  markLoading?: boolean
}

export function FamilyBrand({ familyName, members, loading = false, markLoading = loading }: Props) {
  const label = formatFamilyBrand(loading ? null : familyName, t.appName)

  return <div className="brand" aria-label={label.accessibleLabel}>
    <FamilyMark variant="dynamic" members={members} size={32} loading={markLoading} />
    <span className="brand-lockup family-brand-lockup">
      <span className="wordmark">{label.productName}</span>
      {label.householdName && <span className="household-name" title={label.householdName}>{label.householdName}</span>}
    </span>
  </div>
}
