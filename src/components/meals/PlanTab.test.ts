// @vitest-environment jsdom
import { createElement } from 'react'
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PlanTab } from './PlanTab'
import { changeLanguage } from '../../i18n'

vi.mock('../../context/family/FamilyCoreContext', () => ({ useFamilyCore: () => ({ isParentOrAdmin: true }) }))
vi.mock('../../context/family/FamilyMembersContext', () => ({ useFamilyMembersData: () => ({ members: [], memberById: () => undefined }) }))
vi.mock('../../context/meals/MealsContext', () => ({ useMealsDataContext: () => ({
  meals: [], planEntries: [], addPlanEntry: vi.fn(), updatePlanEntry: vi.fn(), deletePlanEntry: vi.fn(), copyWeek: vi.fn(),
}) }))

describe('PlanTab', () => {
  it('keeps a primary plan action available when the week is empty', async () => {
    await changeLanguage('cs')
    const { container } = render(createElement(PlanTab))
    const action = container.querySelector<HTMLButtonElement>('.tab-toolbar .header-action-button')
    expect(action?.textContent).toContain('Naplánovat jídlo')
    fireEvent.click(action!)
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  })
})
