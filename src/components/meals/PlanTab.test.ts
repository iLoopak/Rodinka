// @vitest-environment jsdom
import { createElement } from 'react'
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PlanTab } from './PlanTab'
import { changeLanguage } from '../../i18n'

const openCreateRecord = vi.hoisted(() => vi.fn())

vi.mock('../../context/family/FamilyCoreContext', () => ({ useFamilyCore: () => ({ isParentOrAdmin: true }) }))
vi.mock('../../context/family/FamilyMembersContext', () => ({ useFamilyMembersData: () => ({ members: [], memberById: () => undefined }) }))
vi.mock('../../context/meals/MealsContext', () => ({ useMealsDataContext: () => ({
  meals: [], planEntries: [], addPlanEntry: vi.fn(), updatePlanEntry: vi.fn(), deletePlanEntry: vi.fn(), copyWeek: vi.fn(),
}) }))
vi.mock('../../context/create-record/CreateRecordContext', () => ({ useCreateRecord: () => ({ openCreateRecord }) }))

describe('PlanTab', () => {
  it('keeps a primary plan action available when the week is empty', async () => {
    await changeLanguage('cs')
const { container } = render(createElement(PlanTab))
    // Migrated to the Button primitive in design Wave 1: same primary action,
    // now `.btn.btn-primary` in the toolbar rather than the ad-hoc class.
    const action = container.querySelector<HTMLButtonElement>('.tab-toolbar .btn.btn-primary')
    expect(action?.textContent).toContain('Naplánovat jídlo')
    fireEvent.click(action!)
    expect(openCreateRecord).toHaveBeenCalledWith(expect.objectContaining({ type: 'meal', source: 'meal-plan' }))
  })
})
