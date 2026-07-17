import { t } from '../../strings'
import type { FamilyMember } from '../../hooks/useFamilyMembers'
import { useAllowanceData } from '../../context/chores/AllowanceContext'
import { activeAllowancePlanFor } from '../../utils/allowancePlans'
import { MemberAvatar } from '../ui/MemberAvatar'
import { AllowancePlanSummaryLine } from './AllowancePlanSummaryLine'

interface Props {
  childMembers: FamilyMember[]
  onEdit: (child: FamilyMember) => void
}

/**
 * Every child's allowance in one place, inside family settings. These rows are
 * a directory, not a second editor: picking one opens the same dialog the
 * child's profile does, which the caller mounts outside this list so the
 * settings <ul> only ever contains list items.
 */
export function FamilyAllowanceSettings({ childMembers, onEdit }: Props) {
  const { allowancePlans, allowanceLoading, allowanceError } = useAllowanceData()

  if (allowanceError) return <li className="more-settings-row"><p className="error" role="alert">{allowanceError}</p></li>
  if (allowanceLoading) return <li className="more-settings-row"><p className="loading">{t.loading.generic}</p></li>
  if (childMembers.length === 0) return <li className="more-settings-row"><p className="row-meta">{t.allowance.noChildren}</p></li>

  return <>
    {childMembers.map((child) => {
      const plan = activeAllowancePlanFor(allowancePlans, child.id)
      return (
        <li key={child.id} className="more-settings-row allowance-settings-row">
          <MemberAvatar member={child} />
          <span className="more-setting-copy">
            <strong className="more-setting-value">{child.display_name}</strong>
            <span className="more-setting-detail"><AllowancePlanSummaryLine plan={plan} /></span>
          </span>
          <span className="row-spacer" />
          <button
            type="button"
            className="btn-secondary"
            aria-label={plan ? t.allowance.editFor(child.display_name) : t.allowance.setUpFor(child.display_name)}
            onClick={() => onEdit(child)}
          >
            {plan ? t.allowance.editShort : t.allowance.setUpShort}
          </button>
        </li>
      )
    })}
  </>
}
