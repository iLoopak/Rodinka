import { useFamilyCore } from '../context/family/FamilyCoreContext'
import { useFamilyMembersData } from '../context/family/FamilyMembersContext'
import { useFamilySettings } from '../context/family/FamilySettingsContext'

export function useActiveFamilyMark() {
  const { familyId, currentMember } = useFamilyCore()
  const { members, membersLoading } = useFamilyMembersData()
  const { familyNameLoading } = useFamilySettings()
  const scopedMembers = members.filter((member) => member.family_id === familyId)

  return {
    members: scopedMembers.length > 0 ? scopedMembers : currentMember ? [currentMember] : [],
    loading: familyNameLoading || membersLoading,
  }
}
