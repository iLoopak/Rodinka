import type { ReminderCopy } from './reminders'

export const reminderCopy: ReminderCopy = {
  choreDueToday: (count, name) => count === 1 ? `Dnes čeká úkol pro ${name}` : `${count} úkoly jsou dnes na řadě pro ${name}`,
  choreOverdue: (count, name) => count === 1 ? `Úkol pro ${name} je po termínu` : `${count} úkoly pro ${name} jsou po termínu`,
  activitySoon: (title) => `Brzy začíná: ${title}`,
  activityPayment: (count) => count === 1 ? 'Blíží se platba za aktivitu' : `${count} platby za aktivity čekají`,
  medicalTomorrow: 'Zítra vás čeká zdravotní návštěva',
  vaccinationDue: 'Blíží se termín očkování',
  votingCloses: (title) => `Hlasování „${title}“ brzy končí`,
  mealEmpty: 'Zítřejší jídelníček je zatím prázdný',
  mealIncomplete: (count) => count === 1 ? 'Jedno jídlo na zítra ještě chybí' : `${count} jídla na zítra ještě chybí`,
  allowancePending: (count) => count === 1 ? 'Jedna odměna čeká na schválení' : `${count} odměny čekají na schválení`,
  documentExpiry: (count) => count === 1 ? 'Rodinný dokument brzy vyprší' : `${count} rodinné dokumenty brzy vyprší`,
  shoppingAssigned: (count) => count === 1 ? 'Máte přiřazenou položku k nákupu' : `${count} položek máte přiřazeno k nákupu`,
  openDetail: 'Otevřít detail',
  forMember: (name) => `Pro: ${name}`,
}
