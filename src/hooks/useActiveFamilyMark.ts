import { useFamilyData } from '../context/FamilyDataContext'

export function useActiveFamilyMark() {
  const { familyId, currentMember, familyNameLoading, members, membersLoading } = useFamilyData()
  const scopedMembers = members.filter((member) => member.family_id === familyId)

  return {
    members: scopedMembers.length > 0 ? scopedMembers : currentMember ? [currentMember] : [],
    loading: familyNameLoading || membersLoading,
  }
}
