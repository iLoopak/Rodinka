import { t } from '../strings'
import { formatFamilyBrand } from '../utils/familyBrand'
import { Logo } from './Logo'

interface Props {
  familyName: string | null
  loading?: boolean
}

export function FamilyBrand({ familyName, loading = false }: Props) {
  const label = formatFamilyBrand(loading ? null : familyName, t.appName)

  return <div className="brand" aria-label={label.accessibleLabel}>
    <Logo size={28} />
    <span className="brand-lockup">
      <span className="wordmark">{label.productName}</span>
      {label.householdName && <span className="household-name" title={label.householdName}>{label.householdName}</span>}
    </span>
  </div>
}
