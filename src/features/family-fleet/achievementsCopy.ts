import type { Language } from '../../i18n/language'

interface AchievementCopyEntry { title: string; description: string }

const copy = {
  cs: {
    'first-flight': { title: 'První let', description: 'Dokonči svůj první let.' },
    'launch-arrow': { title: 'Rychlík', description: 'Dosáhni úrovně 5 v jednom letu.' },
    'iron-guardian': { title: 'Železný strážce', description: 'Přežij 2 minuty v jednom letu.' },
    'comet-strike': { title: 'Kometární úder', description: 'Získej 5 000 bodů v jednom letu.' },
    'five-launches': { title: 'Pět startů', description: 'Odehraj 5 letů.' },
    'stardust-hoarder': { title: 'Sběratel hvězdného prachu', description: 'Nasbírej celkem 100 hvězd.' },
    'family-fleet-assembled': { title: 'Flotila pohromadě', description: 'Ať zahrají alespoň 2 členové rodiny.' },
    'high-roller': { title: 'Vysoké sázky', description: 'Nasbírej celkem 20 000 bodů.' },
    'night-watch': { title: 'Noční hlídka', description: 'Nejdelší let ať trvá alespoň 3 minuty.' },
    'family-champion': { title: 'Rodinný šampion', description: 'Staň se první příčkou rodinného žebříčku.' },
    'demolisher': { title: 'Demolice', description: 'Znič celkem 100 cílů.' },
    'power-collector': { title: 'Sběratel posilovačů', description: 'Seber celkem 20 power-upů.' },
    'top-of-the-fleet': { title: 'Špička flotily', description: 'Dosáhni úrovně 10 v jednom letu.' },
    'shatterpoint': { title: 'Bod zlomu', description: 'Znič 20 cílů v jednom letu.' },
    'starburst-run': { title: 'Hvězdný run', description: 'Seber 15 hvězd v jednom letu.' },
    'veteran-pilot': { title: 'Zkušený pilot', description: 'Odehraj celkem 25 letů.' },
    'marathon-flight': { title: 'Maratonský let', description: 'Nejdelší let ať trvá alespoň 5 minut.' },
    'high-scorer': { title: 'Král skóre', description: 'Získej 10 000 bodů v jednom letu.' },
    'galactic-collector': { title: 'Galaktický sběratel', description: 'Nasbírej celkem 250 hvězd.' },
    'power-master': { title: 'Mistr posilovačů', description: 'Seber celkem 50 power-upů.' },
    'sky-legend': { title: 'Legenda oblohy', description: 'Odemkni alespoň 10 achievementů.' },
    'completionist': { title: 'Sběratel všeho', description: 'Odemkni úplně všechny ostatní achievementy.' },
  },
  en: {
    'first-flight': { title: 'First Flight', description: 'Complete your first flight.' },
    'launch-arrow': { title: 'Speedster', description: 'Reach level 5 in a single flight.' },
    'iron-guardian': { title: 'Iron Guardian', description: 'Survive 2 minutes in a single flight.' },
    'comet-strike': { title: 'Comet Strike', description: 'Score 5,000 points in a single flight.' },
    'five-launches': { title: 'Five Launches', description: 'Play 5 flights.' },
    'stardust-hoarder': { title: 'Stardust Hoarder', description: 'Collect 100 stars in total.' },
    'family-fleet-assembled': { title: 'Fleet Assembled', description: 'Have at least 2 family members play.' },
    'high-roller': { title: 'High Roller', description: 'Earn 20,000 points in total.' },
    'night-watch': { title: 'Night Watch', description: 'Reach a best single flight of 3 minutes.' },
    'family-champion': { title: 'Family Champion', description: 'Take the top spot on the family leaderboard.' },
    'demolisher': { title: 'Demolisher', description: 'Destroy 100 targets in total.' },
    'power-collector': { title: 'Power Collector', description: 'Collect 20 power-ups in total.' },
    'top-of-the-fleet': { title: 'Top of the Fleet', description: 'Reach level 10 in a single flight.' },
    'shatterpoint': { title: 'Shatterpoint', description: 'Destroy 20 targets in a single flight.' },
    'starburst-run': { title: 'Starburst Run', description: 'Collect 15 stars in a single flight.' },
    'veteran-pilot': { title: 'Veteran Pilot', description: 'Play 25 flights in total.' },
    'marathon-flight': { title: 'Marathon Flight', description: 'Reach a best single flight of 5 minutes.' },
    'high-scorer': { title: 'High Scorer', description: 'Score 10,000 points in a single flight.' },
    'galactic-collector': { title: 'Galactic Collector', description: 'Collect 250 stars in total.' },
    'power-master': { title: 'Power Master', description: 'Collect 50 power-ups in total.' },
    'sky-legend': { title: 'Sky Legend', description: 'Unlock at least 10 achievements.' },
    'completionist': { title: 'Completionist', description: 'Unlock every other achievement.' },
  },
} as const satisfies Record<Language, Record<string, AchievementCopyEntry>>

export function achievementCopy(language: Language, id: string): AchievementCopyEntry {
  return (copy[language] as Record<string, AchievementCopyEntry>)[id] ?? { title: id, description: '' }
}
