import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('Calendar realtime ownership', () => {
  it('does not keep a duplicate Calendar-wide realtime channel', () => {
    expect(existsSync(join(root, 'src/calendar/calendarRealtime.ts'))).toBe(false)
    const repository = readFileSync(join(root, 'src/calendar/calendarRepository.ts'), 'utf8')
    expect(repository).not.toContain('subscribeToCalendarRealtime')
    expect(repository).not.toContain('family:${familyId}:calendar-offline')
  })

  it('wires provider snapshots and promotes reconciliation only after local readiness', () => {
    const context = readFileSync(join(root, 'src/context/calendar/CalendarOfflineContext.tsx'), 'utf8')
    const screen = readFileSync(join(root, 'src/components/CalendarScreen.tsx'), 'utf8')
    expect(context).toContain('updateFromProviders(familyId, update)')
    expect(context).toContain('prioritizeReconciliation()')
    expect(screen).toContain('if (!loading) void refresh()')
  })

  it('reuses the existing feature owners for every Calendar snapshot table', () => {
    // The owner of a table moves from its context to its repository as each
    // repository wave lands — meals did in Wave 1. What has to stay true is
    // that every snapshot table has exactly one owner somewhere in this list,
    // so the calendar never opens a second subscription of its own.
    const ownershipSources = [
      'src/context/family/FamilyMembersContext.tsx',
      'src/repositories/chores/choresRepository.ts',
      'src/features/activities/data/supabaseActivitiesRepository.ts',
      'src/repositories/medical/medicalRepository.ts',
      'src/features/meals/data/supabaseMealsRepository.ts',
      'src/context/chores/AllowanceContext.tsx',
    ].map((file) => readFileSync(join(root, file), 'utf8')).join('\n')
    for (const table of [
      'members', 'chores', 'chore_completions', 'activities', 'activity_participants',
      'medical_records', 'meal_plan_entries', 'occurrence_overrides',
      'series_assignment_history', 'activity_participant_history', 'allowance_plans',
    ]) expect(ownershipSources).toContain(`table: '${table}'`)
  })
})
