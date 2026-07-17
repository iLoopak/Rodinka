import { t } from '../../strings'
import type { FamilyMember } from '../../hooks/useFamilyMembers'
import { useAllowanceData } from '../../context/chores/AllowanceContext'
import { useChoresData } from '../../context/chores/ChoresContext'
import { activeAllowancePlanFor } from '../../utils/allowancePlans'
import { Modal } from '../ui/Modal'
import { AllowancePlanForm } from '../AllowancePlanForm'

interface Props {
  child: FamilyMember
  onClose: () => void
}

/**
 * The single place the allowance form is mounted. Every entry point — the
 * child's profile, family settings, the chores screen — renders this, so they
 * cannot drift apart. It reads the plan and the write actions from context
 * rather than taking them as props, so a caller only needs the child.
 */
export function AllowancePlanDialog({ child, onClose }: Props) {
  const { allowancePlans, saveAllowancePlan, deleteAllowancePlan } = useAllowanceData()
  const { chores } = useChoresData()
  const plan = activeAllowancePlanFor(allowancePlans, child.id)

  return (
    <Modal title={plan ? t.allowance.edit : t.allowance.setUp} onClose={onClose}>
      <AllowancePlanForm
        child={child}
        chores={chores}
        initial={plan ?? undefined}
        onSubmit={async (input) => {
          await saveAllowancePlan(input, plan?.id)
          onClose()
        }}
        onDelete={plan ? async () => {
          await deleteAllowancePlan(plan.id)
          onClose()
        } : undefined}
      />
    </Modal>
  )
}
