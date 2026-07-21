import type { Language } from '../../i18n/language'
const copy = {
  cs: { title: 'Rodinná herna', subtitle: 'Krátké rodinné hry pro společné překonávání rekordů.', choose: 'Vyber si hru', back: 'Zpět do Rodinky', play: 'Hrát', personalBest: 'Osobní rekord', noRecord: 'Zatím bez rekordu' },
  en: { title: 'Family Arcade', subtitle: 'Pick a quick family challenge.', choose: 'Choose a game', back: 'Back to Rodinka', play: 'Play', personalBest: 'Personal best', noRecord: 'No record yet' },
} as const
export function arcadeCopy(language: Language) { return copy[language] }
