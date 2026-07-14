export interface FamilyBrandLabel {
  productName: string
  householdName: string | null
  accessibleLabel: string
}

export function normalizeFamilyName(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, ' ') ?? ''
}

export function formatFamilyBrand(
  familyName: string | null | undefined,
  productName = 'Rodinka'
): FamilyBrandLabel {
  const normalizedProduct = normalizeFamilyName(productName) || 'Rodinka'
  let normalizedFamily = normalizeFamilyName(familyName)

  if (normalizedFamily.toLocaleLowerCase('cs-CZ') === normalizedProduct.toLocaleLowerCase('cs-CZ')) {
    normalizedFamily = ''
  } else {
    const escapedProduct = normalizedProduct.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const duplicatePrefix = new RegExp(`^${escapedProduct}(?:\\s*[·:–—-]\\s*|\\s+)(.+)$`, 'iu')
    normalizedFamily = normalizedFamily.match(duplicatePrefix)?.[1]?.trim() ?? normalizedFamily
  }

  return {
    productName: normalizedProduct,
    householdName: normalizedFamily || null,
    accessibleLabel: normalizedFamily ? `${normalizedProduct} ${normalizedFamily}` : normalizedProduct,
  }
}
