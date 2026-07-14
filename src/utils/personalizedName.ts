import { vocative } from 'czech-vocative'
import type { Lang } from '../strings'

export interface CzechVocativeNameInput {
  firstName: string | null | undefined
  manualVocative?: string | null
}

export interface LocalizedAddressNameInput extends CzechVocativeNameInput {
  locale: Lang
}

export type VocativeConverter = (name: string) => string

export function normalizePersonalName(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, ' ') ?? ''
}

function looksLikeEmail(value: string): boolean {
  return value.includes('@') && !value.includes(' ')
}

function preserveLeadingCapitalization(source: string, result: string): string {
  if (!source || !result) return result
  const sourceStartsUppercase = source[0] === source[0].toLocaleUpperCase('cs-CZ')
    && source[0] !== source[0].toLocaleLowerCase('cs-CZ')
  const resultStartsLowercase = result[0] === result[0].toLocaleLowerCase('cs-CZ')
    && result[0] !== result[0].toLocaleUpperCase('cs-CZ')
  return sourceStartsUppercase && resultStartsLowercase
    ? result[0].toLocaleUpperCase('cs-CZ') + result.slice(1)
    : result
}

function inflectSimplePart(part: string, converter: VocativeConverter): string {
  if (!/^\p{L}[\p{L}'’]*$/u.test(part)) return part
  try {
    const converted = normalizePersonalName(converter(part))
    if (!converted || converted.includes(' ') || looksLikeEmail(converted)) return part
    return preserveLeadingCapitalization(part, converted)
  } catch {
    return part
  }
}

function inflectFirstName(firstName: string, converter: VocativeConverter): string {
  const [firstPart, ...remainingParts] = firstName.split(' ')
  const convertedFirstPart = firstPart
    .split(/([-‐‑‒–—])/u)
    .map((part) => /^[-‐‑‒–—]$/u.test(part) ? part : inflectSimplePart(part, converter))
    .join('')
  return [convertedFirstPart, ...remainingParts].join(' ')
}

export function getCzechVocativeName(
  { firstName, manualVocative }: CzechVocativeNameInput,
  converter: VocativeConverter = vocative
): string {
  const normalizedManual = normalizePersonalName(manualVocative)
  if (normalizedManual) return normalizedManual

  const normalizedFirstName = normalizePersonalName(firstName)
  if (!normalizedFirstName || looksLikeEmail(normalizedFirstName)) return normalizedFirstName
  if (!/^[\p{L}'’\s‐‑‒–—-]+$/u.test(normalizedFirstName)) return normalizedFirstName
  return inflectFirstName(normalizedFirstName, converter)
}

export function getLocalizedAddressName(
  input: LocalizedAddressNameInput,
  converter: VocativeConverter = vocative
): string {
  const normalizedFirstName = normalizePersonalName(input.firstName)
  if (input.locale !== 'cs') return normalizedFirstName
  return getCzechVocativeName(input, converter)
}
