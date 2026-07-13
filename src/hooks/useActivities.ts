import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { t } from '../strings'

export type ActivityCategory =
  | 'swimming'
  | 'dance'
  | 'football'
  | 'music'
  | 'speech_therapy'
  | 'club'
  | 'camp'
  | 'after_school'
  | 'other'

export type ActivityRecurrenceType = 'one_off' | 'weekly' | 'biweekly' | 'custom_weekdays'
export type ActivityPaymentFrequency = 'one_time' | 'weekly' | 'monthly' | 'term' | 'yearly'
export type ActivityStatus = 'active' | 'paused' | 'finished'

export interface Activity {
  id: string
  family_id: string
  title: string
  category: ActivityCategory
  child_id: string
  responsible_member_id: string | null
  secondary_responsible_member_id: string | null
  location: string | null
  coach_name: string | null
  coach_phone: string | null
  coach_email: string | null
  notes: string | null
  skill_level: string | null
  start_date: string
  end_date: string | null
  recurrence_type: ActivityRecurrenceType
  // ISO weekday numbers 1 (Mon) .. 7 (Sun); only meaningful for 'custom_weekdays'.
  recurrence_weekdays: number[] | null
  start_time: string | null
  end_time: string | null
  payment_amount: number | null
  payment_frequency: ActivityPaymentFrequency | null
  next_payment_due_date: string | null
  status: ActivityStatus
  reminder_enabled: boolean
  reminder_days_before: number | null
  created_at: string
  updated_at: string
}

export function useActivities(familyId: string | undefined) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!familyId) {
      setActivities([])
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error } = await supabase
      .from('activities')
      .select('id, family_id, title, category, child_id, responsible_member_id, secondary_responsible_member_id, location, coach_name, coach_phone, coach_email, notes, skill_level, start_date, end_date, recurrence_type, recurrence_weekdays, start_time, end_time, payment_amount, payment_frequency, next_payment_due_date, status, reminder_enabled, reminder_days_before, created_at, updated_at')
      .eq('family_id', familyId)
      .order('start_date')

    if (error) {
      console.error('Failed to load activities:', error.message)
      setActivities([])
      setError(t.errors.loadFailed)
    } else {
      setActivities(data)
      setError(null)
    }
    setLoading(false)
  }, [familyId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { activities, loading, error, refresh }
}
