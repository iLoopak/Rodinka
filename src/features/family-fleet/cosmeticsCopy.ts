import type { Language } from '../../i18n/language'
import type { CosmeticCategory } from './cosmetics'

const categoryLabels = {
  cs: { hull: 'Trup', engineTrail: 'Motorová stopa', cabin: 'Kabina', wings: 'Křídla', hitEffect: 'Efekt zásahu' },
  en: { hull: 'Hull', engineTrail: 'Engine trail', cabin: 'Cabin', wings: 'Wings', hitEffect: 'Hit effect' },
} as const satisfies Record<Language, Record<CosmeticCategory, string>>

const itemNames = {
  cs: {
    explorer: 'Rodinný průzkumník', arrow: 'Šíp', guardian: 'Strážce', comet: 'Kometa',
    standard: 'Standardní', double: 'Dvojitá stopa', stardust: 'Hvězdný prach', familyWave: 'Rodinná vlna', rainbow: 'Duha',
    clear: 'Čirá', gold: 'Zlatá', night: 'Noční', familyCrest: 'Rodinný znak',
    none: 'Bez doplňků', doubleFins: 'Dvojité ploutve', orbitalRings: 'Orbitální prstence', starPanels: 'Hvězdné panely',
    pixelShatter: 'Pixelový rozpad', starBurst: 'Hvězdný výbuch',
  },
  en: {
    explorer: 'Family Explorer', arrow: 'Arrow', guardian: 'Guardian', comet: 'Comet',
    standard: 'Standard', double: 'Double trail', stardust: 'Stardust', familyWave: 'Family wave', rainbow: 'Rainbow',
    clear: 'Clear', gold: 'Gold', night: 'Night', familyCrest: 'Family crest',
    none: 'No add-ons', doubleFins: 'Double fins', orbitalRings: 'Orbital rings', starPanels: 'Star panels',
    pixelShatter: 'Pixel shatter', starBurst: 'Star burst',
  },
} as const satisfies Record<Language, Record<string, string>>

export function cosmeticCategoryLabel(language: Language, category: CosmeticCategory): string {
  return categoryLabels[language][category]
}

export function cosmeticItemName(language: Language, id: string): string {
  return (itemNames[language] as Record<string, string>)[id] ?? id
}

export const familyFleetHangarCopy = {
  cs: {
    title: 'Hangár', subtitle: 'Vyberte kosmetické vylepšení pro svou loď. Ovládání a hitbox se nikdy nemění.',
    backToFleet: 'Zpět na flotilu', shipPreview: 'Náhled lodi', use: 'Použít', equipped: 'Použito',
    locked: 'Zamčeno', unlockHint: (title: string) => `Odemkni splněním: ${title}`, achievementsProgress: (unlocked: number, total: number) => `Achievementy: ${unlocked} / ${total}`,
    choosePilot: 'Vyber pilota',
  },
  en: {
    title: 'Hangar', subtitle: "Pick cosmetic upgrades for your ship. Controls and hitbox never change.",
    backToFleet: 'Back to fleet', shipPreview: 'Ship preview', use: 'Use', equipped: 'Equipped',
    locked: 'Locked', unlockHint: (title: string) => `Unlock by earning: ${title}`, achievementsProgress: (unlocked: number, total: number) => `Achievements: ${unlocked} / ${total}`,
    choosePilot: 'Choose pilot',
  },
} as const satisfies Record<Language, Record<string, unknown>>

export function familyFleetHangarCopyFor(language: Language) {
  return familyFleetHangarCopy[language]
}
