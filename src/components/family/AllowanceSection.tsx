import { useState } from 'react'
import { t } from '../../strings'
import type { FamilyMember } from '../../hooks/useFamilyMembers'
import { useAllowanceData } from '../../context/chores/AllowanceContext'
import { activeAllowancePlanFor } from '../../utils/allowancePlans'
import { AllowancePlanDialog } from '../allowance/AllowancePlanDialog'
import { AllowancePlanSummaryLine } from '../allowance/AllowancePlanSummaryLine'

interface Props {
  child: FamilyMember
}

// The allowance panel inside a child's profile. Visibility is the caller's
// call (adults never see it, and neither does a child editing their own
// profile); every write it offers is re-checked by is_family_parent server-side.
export function AllowanceSection({ child }: Props) {
  const { allowancePlans, allowanceLoading, allowanceError } = useAllowanceData()
  const [editing, setEditing] = useState(false)
  const plan = activeAllowancePlanFor(allowancePlans, child.id)

  return (
    <section className="form-section allowance-section" aria-labelledby="allowance-section-title">
      <h4 id="allowance-section-title">{t.allowance.sectionTitle}</h4>

      {allowanceError
        ? <p className="error" role="alert">{allowanceError}</p>
        : allowanceLoading
          ? <p className="loading">{t.loading.generic}</p>
          : <>
              <p className="allowance-section-status"><AllowancePlanSummaryLine plan={plan} /></p>
              {plan
                ? plan.note && <p className="field-hint">{plan.note}</p>
                : <p className="field-hint">{t.allowance.notSetHint}</p>}

              <div className="family-actions">
                <button type="button" onClick={() => setEditing(true)}>
                  {plan ? t.allowance.edit : t.allowance.setUp}
                </button>
              </div>
            </>}

      {editing && <AllowancePlanDialog key={child.id} child={child} onClose={() => setEditing(false)} />}
    </section>
  )
}
