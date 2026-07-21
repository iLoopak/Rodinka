import type { ReminderCopy } from './reminders.ts'
import type { ReminderLocale } from './reminderSourceTypes.ts'

const czechReminderCopy: ReminderCopy = {
  choreDueToday: (count, name) => count === 1 ? `Dnes čeká úkol pro ${name}` : `${count} úkoly jsou dnes na řadě pro ${name}`,
  choreOverdue: (count, name) => count === 1 ? `Úkol pro ${name} je po termínu` : `${count} úkoly pro ${name} jsou po termínu`,
  activitySoon: (title) => `Brzy začíná: ${title}`,
  activityPayment: (count) => count === 1 ? 'Blíží se platba za aktivitu' : `${count} platby za aktivity čekají`,
  medicalTomorrow: 'Zítra vás čeká zdravotní návštěva',
  vaccinationDue: 'Blíží se termín očkování',
  votingCloses: (title) => `Hlasování „${title}“ brzy končí`,
  allowancePending: (count) => count === 1 ? 'Jedna odměna čeká na schválení' : `${count} odměny čekají na schválení`,
  documentExpiry: (count) => count === 1 ? 'Rodinný dokument brzy vyprší' : `${count} rodinné dokumenty brzy vyprší`,
  shoppingAssigned: (count) => count === 1 ? 'Máte přiřazenou položku k nákupu' : `${count} položek máte přiřazeno k nákupu`,
  openDetail: 'Otevřít detail',
  forMember: (name) => `Pro: ${name}`,
}

const englishReminderCopy: ReminderCopy = {
  choreDueToday: (count, name) => count === 1 ? `A task for ${name} is due today` : `${count} tasks for ${name} are due today`,
  choreOverdue: (count, name) => count === 1 ? `A task for ${name} is overdue` : `${count} tasks for ${name} are overdue`,
  activitySoon: (title) => `Starting soon: ${title}`,
  activityPayment: (count) => count === 1 ? 'An activity payment is coming up' : `${count} activity payments are coming up`,
  medicalTomorrow: 'You have a health appointment tomorrow',
  vaccinationDue: 'A vaccination is due soon',
  votingCloses: (title) => `Voting on “${title}” closes soon`,
  allowancePending: (count) => count === 1 ? 'One reward is waiting for approval' : `${count} rewards are waiting for approval`,
  documentExpiry: (count) => count === 1 ? 'A family document expires soon' : `${count} family documents expire soon`,
  shoppingAssigned: (count) => count === 1 ? 'A shopping item is assigned to you' : `${count} shopping items are assigned to you`,
  openDetail: 'Open details',
  forMember: (name) => `For: ${name}`,
}

export function reminderCopyFor(language: ReminderLocale): ReminderCopy {
  return language === 'cs' ? czechReminderCopy : englishReminderCopy
}
