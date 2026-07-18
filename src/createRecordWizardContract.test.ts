import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const wizard = read('./components/create-record/CreateRecordWizard.tsx')
const controller = read('./context/create-record/CreateRecordContext.tsx')
const planner = read('./components/PlannerScreen.tsx')
const plannerRow = read('./components/planner/PlannerAreaCard.tsx')
const styles = read('./index.css')

describe('unified record creation wizard contract', () => {
  it('offers every required planning record and reuses the existing feature forms', () => {
    for (const type of ['household-task', 'activity', 'medical', 'meal', 'shopping-item']) {
      expect(wizard).toContain(`type: '${type}'`)
      expect(wizard).toContain(`create.selectedType === '${type}'`)
    }
    for (const form of ['AddChoreForm', 'AddActivityForm', 'AddMedicalRecordForm', 'AddPlanEntryForm', 'ShoppingItemForm', 'AddMealForm', 'CreateRoundForm']) {
      expect(wizard).toContain(`<${form}`)
    }
    expect(wizard.match(/variant="guided"/g)).toHaveLength(7)
    expect(wizard).toContain('button.dataset.createIgnoreDirty')
  })

  it('owns history, dirty-state confirmation, and a guarded submit lifecycle centrally', () => {
    expect(controller).toContain("window.addEventListener('popstate'")
    expect(controller).toContain('window.history.pushState')
    expect(controller).toContain('t.create.discardChanges')
    expect(controller).toContain('submittingRef.current')
    expect(controller).toContain("status: 'submitting'")
  })

  it('keeps Planning to one header create action and navigation-only rows', () => {
    expect(planner).toContain("openCreateRecord({ source: 'planning' })")
    expect(plannerRow).toContain('className="planner-area-link"')
    expect(plannerRow).not.toContain('<button')
    expect(plannerRow).not.toContain('onCreate')
  })

  it('uses a safe-area-aware fullscreen mobile shell with mobile-safe controls', () => {
    expect(styles).toMatch(/\.modal-sheet\.create-record-wizard\s*\{[^}]*height:\s*100dvh[^}]*max-height:\s*100dvh/s)
    expect(styles).toMatch(/\.create-record-wizard > \.modal-header\s*\{[^}]*safe-area-inset-top/s)
    expect(styles).toMatch(/\.guided-create-footer\s*\{[^}]*safe-area-inset-bottom/s)
    expect(styles).toMatch(/\.guided-create-scroll\s*\{[^}]*overflow-y:\s*auto/s)
    expect(styles).toMatch(/input,\s*select,\s*textarea\s*\{[^}]*font-size:\s*var\(--font-size-control\)/s)
  })

  it('uses progressive disclosure and a fixed action area for guided creation', () => {
    expect(styles).toContain('.guided-primary-section')
    expect(styles).toContain('.guided-disclosure-button')
    expect(styles).toContain('.guided-member-choice')
    expect(styles).toContain('.guided-shortcut')
    expect(styles).toContain('.guided-create-footer')
  })
})
