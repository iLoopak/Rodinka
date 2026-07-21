import type { Route } from '../../router'
import type { Language } from '../../i18n/language'
export type LocalizedText = Record<Language, string>
export type ArcadeGameKey = 'family-jump' | 'family-fleet'
export interface ArcadeGameDefinition { key: ArcadeGameKey; route: Route; title: LocalizedText; description: LocalizedText; artworkVariant: 'jump' | 'fleet'; availability: 'available' | 'coming-soon' }
