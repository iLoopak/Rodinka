export function isInitialFamilyDataLoad(loadedFamilyId: string | undefined, familyId: string | undefined) {
  return Boolean(familyId && loadedFamilyId !== familyId)
}
