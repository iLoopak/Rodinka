import type { ReactNode } from 'react'
import { t } from '../strings'

export type CalendarItemType = 'chore' | 'activity' | 'payment' | 'medical' | 'vaccination'

interface ItemTypeStyle {
  colorVar: string
  label: string
  icon: ReactNode
}

function ChoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="5" strokeLinejoin="round" />
      <path d="m8.5 12.5 2.5 2.5 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ActivityIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PaymentIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" strokeLinecap="round" />
    </svg>
  )
}

function MedicalIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 4v16M4 12h16" strokeLinecap="round" />
    </svg>
  )
}

function VaccinationIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m5 19 6-6M14 4l6 6-9 9H5v-6l9-9Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function getItemTypeStyle(type: CalendarItemType): ItemTypeStyle {
  switch (type) {
    case 'chore':
      return { colorVar: '--accent-sage', label: t.calendar.typeChore, icon: <ChoreIcon /> }
    case 'activity':
      return { colorVar: '--accent-lavender', label: t.calendar.typeActivity, icon: <ActivityIcon /> }
    case 'payment':
      return { colorVar: '--accent-honey', label: t.calendar.typePayment, icon: <PaymentIcon /> }
    case 'medical':
      return { colorVar: '--accent-sky', label: t.calendar.typeMedical, icon: <MedicalIcon /> }
    case 'vaccination':
      return { colorVar: '--accent-berry', label: t.calendar.typeVaccination, icon: <VaccinationIcon /> }
  }
}
