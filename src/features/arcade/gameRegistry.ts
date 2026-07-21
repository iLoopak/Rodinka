import type { ArcadeGameDefinition } from './types'
export const ARCADE_GAMES: readonly ArcadeGameDefinition[] = [
  { key: 'family-jump', route: '/arcade/family-jump', title: { cs: 'Family Jump', en: 'Family Jump' }, description: { cs: 'Vyskákej co nejvýš, odemykej doplňky a překonej rodinné rekordy.', en: 'Jump as high as you can, unlock cosmetics, and beat family records.' }, artworkVariant: 'jump', availability: 'available' },
  { key: 'family-fleet', route: '/arcade/family-fleet', title: { cs: 'Rodinná flotila', en: 'Family Fleet' }, description: { cs: 'Proleť galaxií, sbírej hvězdy a překonej rodinné rekordy.', en: 'Fly through the galaxy, collect stars, and beat family records.' }, artworkVariant: 'fleet', availability: 'available' },
] as const
