import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const formSource = readFileSync(new URL('./components/AddActivityForm.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('./index.css', import.meta.url), 'utf8')

describe('activity form implementation contract', () => {
  it('keeps every legacy persistence field in the submission payload', () => {
    const payload = formSource.match(/await onSubmit\(\{([\s\S]*?)\n\s*\}\)/)?.[1] ?? ''
    for (const field of [
      'participantIds', 'responsibleMemberId', 'secondaryResponsibleMemberId', 'location',
      'coachName', 'coachPhone', 'coachEmail', 'notes', 'skillLevel', 'startDate', 'endDate',
      'recurrenceType', 'recurrenceWeekdays', 'startTime', 'endTime', 'paymentAmount',
      'paymentFrequency', 'nextPaymentDueDate', 'status', 'reminderEnabled', 'reminderDaysBefore',
    ]) {
      expect(payload).toMatch(new RegExp(`\\b${field}\\b`))
    }
  })

  it('keeps optional groups mounted only when explicitly disclosed', () => {
    expect(formSource).toContain('advancedOpen &&')
    expect(formSource).toContain('contactOpen &&')
    expect(formSource).toContain('paymentOpen &&')
    expect(formSource).toContain('reminderEnabled &&')
  })

  it('uses one scrolling region, a viewport-height sheet and safe sticky action area', () => {
    expect(styles).toMatch(/\.modal-sheet\.activity-form-modal\s*\{[^}]*height:\s*100dvh/s)
    expect(styles).toMatch(/\.activity-form-scroll\s*\{[^}]*overflow-y:\s*auto/s)
    expect(styles).toMatch(/\.activity-form-footer\s*\{[^}]*safe-area-inset-bottom/s)
    expect(styles).toMatch(/\.activity-form-modal \.modal-header\s*\{[^}]*safe-area-inset-top/s)
  })
})
