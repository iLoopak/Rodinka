import type { ComponentType, ReactNode } from 'react'
import { CheckCircle, Coins, Dumbbell, Stethoscope, Syringe, Utensils, type LucideProps } from 'lucide-react'
import { t } from '../strings'

export type CalendarItemType = 'chore' | 'activity' | 'payment' | 'medical' | 'vaccination' | 'meal' | 'allowance'

interface ItemTypeStyle {
  colorVar: string
  surfaceVar: string
  borderVar: string
  category: 'tasks' | 'activities' | 'health' | 'meals' | 'family'
  label: string
  /** The icon component itself, so <ItemTypeIcon> can size/stroke it precisely. */
  Icon: ComponentType<LucideProps>
  /** A ready-to-drop-in default instance, for simple inline (non-container) usages. */
  icon: ReactNode
}

export function getItemTypeStyle(type: CalendarItemType): ItemTypeStyle {
  switch (type) {
    case 'chore':
      return { colorVar: '--category-tasks', surfaceVar: '--category-tasks-soft', borderVar: '--category-tasks-border', category: 'tasks', label: t.calendar.typeChore, Icon: CheckCircle, icon: <CheckCircle size={16} /> }
    case 'activity':
      return { colorVar: '--category-activities', surfaceVar: '--category-activities-soft', borderVar: '--category-activities-border', category: 'activities', label: t.calendar.typeActivity, Icon: Dumbbell, icon: <Dumbbell size={16} /> }
    case 'payment':
      return { colorVar: '--category-family', surfaceVar: '--category-family-soft', borderVar: '--category-family-border', category: 'family', label: t.calendar.typePayment, Icon: Coins, icon: <Coins size={16} /> }
    case 'medical':
      return { colorVar: '--category-health', surfaceVar: '--category-health-soft', borderVar: '--category-health-border', category: 'health', label: t.calendar.typeMedical, Icon: Stethoscope, icon: <Stethoscope size={16} /> }
    case 'vaccination':
      return { colorVar: '--category-health-strong', surfaceVar: '--category-health-soft', borderVar: '--category-health-border', category: 'health', label: t.calendar.typeVaccination, Icon: Syringe, icon: <Syringe size={16} /> }
    case 'meal':
      return { colorVar: '--category-meals', surfaceVar: '--category-meals-soft', borderVar: '--category-meals-border', category: 'meals', label: t.calendar.typeMeal, Icon: Utensils, icon: <Utensils size={16} /> }
    case 'allowance':
      return { colorVar: '--category-family', surfaceVar: '--category-family-soft', borderVar: '--category-family-border', category: 'family', label: t.calendar.typeAllowance, Icon: Coins, icon: <Coins size={16} /> }
  }
}
