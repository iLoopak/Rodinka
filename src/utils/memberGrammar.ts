import type { GrammaticalGender } from '../hooks/useFamilyMembers'

export interface GrammaticalVariants {
  masculine: string
  feminine: string
  neutral: string
}

export type GrammaticalValue = GrammaticalGender | null | undefined | (string & {})

export function memberGrammarVariant(
  variants: GrammaticalVariants,
  gender: GrammaticalValue
): string {
  if (gender === 'masculine') return variants.masculine
  if (gender === 'feminine') return variants.feminine
  return variants.neutral
}
