import {
  BookOpen,
  CalendarDays,
  CircleDot,
  Compass,
  Goal,
  Home,
  MessageCircle,
  Music,
  Palmtree,
  PartyPopper,
  PersonStanding,
  Star,
  Tent,
  Waves,
  type LucideProps,
} from 'lucide-react'
import type { ComponentType } from 'react'
import type { ActivityCategory } from '../features/activities/domain/activityTypes'

/**
 * One icon per activity category, so "swimming" doesn't show the same
 * generic mark as "football" or a birthday party. Keyed off `category`
 * (already a required, non-null field) rather than a separate stored icon
 * key — nothing to fall back on null for, and nothing that can drift out
 * of sync with the category the user actually picked.
 */
export function activityCategoryIcon(category: ActivityCategory): ComponentType<LucideProps> {
  switch (category) {
    case 'swimming': return Waves
    case 'dance': return PersonStanding
    case 'football': return Goal
    case 'music': return Music
    case 'speech_therapy': return MessageCircle
    case 'club': return Star
    case 'camp': return Tent
    case 'after_school': return BookOpen
    case 'other': return CircleDot
    case 'vacation': return Palmtree
    case 'trip': return Compass
    case 'celebration': return PartyPopper
    case 'family_visit': return Home
    case 'other_event': return CalendarDays
  }
}
