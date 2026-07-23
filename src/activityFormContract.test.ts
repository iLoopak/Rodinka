import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const formSource = readFileSync(new URL('./components/AddActivityForm.tsx', import.meta.url), 'utf8')
const detailModalSource = readFileSync(new URL('./components/ActivityDetailModal.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('./index.css', import.meta.url), 'utf8')
const modalPrimitiveStyles = readFileSync(new URL('./styles/primitives/modal.css', import.meta.url), 'utf8')

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

  it('uses one vertical scrolling region, a viewport-height sheet and safe sticky action area', () => {
    // The height/scroll contract lives on the shared `.modal-sheet-fullscreen`
    // primitive; the edit modal opts in via `size="fullscreen"` rather than
    // reimplementing it.
    expect(detailModalSource).toMatch(/<Modal[^>]*size="fullscreen"[^>]*className="activity-form-modal"/s)
    expect(modalPrimitiveStyles).toMatch(/\.modal-sheet\.modal-sheet-fullscreen\s*\{[^}]*height:\s*calc\(100dvh - var\(--keyboard-inset, 0px\)\)/s)
    expect(styles).toMatch(/\.activity-form-scroll\s*\{[^}]*min-width:\s*0[^}]*overflow-x:\s*hidden[^}]*overflow-y:\s*auto/s)
    expect(styles).toMatch(/\.activity-form-footer\s*\{[^}]*safe-area-inset-bottom/s)
    expect(styles).toMatch(/\.activity-form-modal \.modal-header\s*\{[^}]*safe-area-inset-top/s)
  })

  it('wraps recurrence controls instead of horizontally scrolling on phones', () => {
    expect(styles).toMatch(/@media \(max-width: 559px\)[\s\S]*?\.recurrence-chip-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)[^}]*overflow-x:\s*visible/s)
    expect(styles).toMatch(/@media \(max-width: 559px\)[\s\S]*?\.weekday-picker\.compact\s*\{[^}]*grid-template-columns:\s*repeat\(7, minmax\(0, 1fr\)\)[^}]*overflow-x:\s*visible/s)
  })
})
