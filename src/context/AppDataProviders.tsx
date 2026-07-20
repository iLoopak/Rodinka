import type { ReactNode } from 'react'
import type { Member } from '../hooks/useFamily'
import { FamilyCoreProvider } from './family/FamilyCoreContext'
import { FamilyMembersProvider } from './family/FamilyMembersContext'
import { FamilySettingsProvider } from './family/FamilySettingsContext'
import { ChoresProvider } from './chores/ChoresContext'
import { AllowanceProvider } from './chores/AllowanceContext'
import { ActivitiesProvider } from './activities/ActivitiesContext'
import { OccurrenceAssignmentsProvider } from './activities/OccurrenceAssignmentsContext'
import { MedicalProvider } from './health/MedicalContext'
import { MealsProvider } from './meals/MealsContext'
import { ShoppingProvider } from './shopping/ShoppingContext'
import { MessagesSummaryProvider } from './messages/MessagesSummaryContext'
import { CalendarOfflineProvider } from './calendar/CalendarOfflineContext'

interface Props {
  member: Member
  userId: string
  userEmail: string
  children: ReactNode
}

// Every provider below FamilyCoreProvider only needs a primitive (familyId,
// sometimes userId/currentMemberId) — never another feature context's data.
// They're passed down as explicit props from here rather than each provider
// calling useFamilyCore() internally, so none of these modules import each
// other (see the plan's "provider nesting" note for the two deliberate
// exceptions: Allowance nests inside Chores because allowance-plan
// requirements reference chore IDs, and chore-approval's ledger refresh is
// composed in useChoreApprovalActions.ts rather than as a context dependency
// in either direction).
export function AppDataProviders({ member, userId, userEmail, children }: Props) {
  const familyId = member.family_id
  const currentMemberId = member.id

  return (
    <FamilyCoreProvider member={member} userId={userId} userEmail={userEmail}>
      <FamilyMembersProvider familyId={familyId} userId={userId}>
        <FamilySettingsProvider familyId={familyId}>
          <ChoresProvider familyId={familyId} userId={userId} currentMemberId={currentMemberId}>
            <AllowanceProvider familyId={familyId}>
              <ActivitiesProvider familyId={familyId}>
                <OccurrenceAssignmentsProvider familyId={familyId}>
                  <MedicalProvider familyId={familyId} userId={userId}>
                    <MealsProvider familyId={familyId} userId={userId}>
                      <CalendarOfflineProvider familyId={familyId} userId={userId} currentMemberId={currentMemberId}>
                        <ShoppingProvider familyId={familyId} currentMemberId={currentMemberId}>
                          <MessagesSummaryProvider familyId={familyId} currentMemberId={currentMemberId}>
                            {children}
                          </MessagesSummaryProvider>
                        </ShoppingProvider>
                      </CalendarOfflineProvider>
                    </MealsProvider>
                  </MedicalProvider>
                </OccurrenceAssignmentsProvider>
              </ActivitiesProvider>
            </AllowanceProvider>
          </ChoresProvider>
        </FamilySettingsProvider>
      </FamilyMembersProvider>
    </FamilyCoreProvider>
  )
}
