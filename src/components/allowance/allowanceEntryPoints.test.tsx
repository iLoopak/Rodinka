// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../strings'
import { changeLanguage } from '../../i18n'
import type { FamilyMember } from '../../hooks/useFamilyMembers'
import type { AllowancePlan } from '../../hooks/useAllowancePlans'

const admin: FamilyMember = { id: 'admin-1', family_id: 'family-1', display_name: 'Anna', role: 'admin', user_id: 'auth-admin', birth_date: null, color_key: null, avatar_path: null, avatar_url: null, grammatical_gender: null, vocative_name: null, status: 'active' }
const child: FamilyMember = { ...admin, id: 'child-1', display_name: 'Alex', role: 'child', user_id: 'auth-child' }
const parent: FamilyMember = { ...admin, id: 'parent-2', display_name: 'Petr', role: 'parent', user_id: 'auth-parent' }

const weeklyPlan: AllowancePlan = {
  id: 'plan-1', family_id: 'family-1', member_id: child.id, amount: 50,
  frequency: 'weekly', payout_day: null, payout_weekday: 7, note: null,
  starts_on: '2026-07-01', status: 'active', condition_mode: 'none',
  created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z', requirements: [],
}

const allowanceState = {
  allowancePlans: [] as AllowancePlan[],
  allowanceLoading: false,
  allowanceError: null as string | null,
  saveAllowancePlan: vi.fn(),
  deleteAllowancePlan: vi.fn(),
}

vi.mock('../../context/chores/AllowanceContext', () => ({ useAllowanceData: () => allowanceState }))
vi.mock('../../context/chores/ChoresContext', () => ({ useChoresData: () => ({ chores: [] }) }))
vi.mock('../ui/MemberAvatar', () => ({
  MemberAvatar: ({ member }: { member: FamilyMember }) => createElement('span', null, member.display_name.slice(0, 1)),
}))

const { AllowanceSection } = await import('../family/AllowanceSection')
const { FamilyAllowanceSettings } = await import('./FamilyAllowanceSettings')
const { canManageAllowance } = await import('../../utils/allowancePlans')

describe('allowance entry points', () => {
  beforeEach(async () => {
    await changeLanguage('cs')
    allowanceState.allowancePlans = []
    allowanceState.allowanceError = null
    allowanceState.allowanceLoading = false
  })
  afterEach(cleanup)

  it('offers set-up on a child profile that has no plan', () => {
    render(createElement(AllowanceSection, { child }))
    expect(screen.getByRole('button', { name: t.allowance.setUp })).toBeTruthy()
    expect(screen.getByText(t.allowance.notSet)).toBeTruthy()
  })

  it('offers editing and shows the summary once a plan exists', () => {
    allowanceState.allowancePlans = [weeklyPlan]
    render(createElement(AllowanceSection, { child }))
    expect(screen.getByRole('button', { name: t.allowance.edit })).toBeTruthy()
    expect(screen.getByText(/každou neděli/)).toBeTruthy()
  })

  it('marks a paused plan as paused', () => {
    allowanceState.allowancePlans = [{ ...weeklyPlan, status: 'paused' }]
    render(createElement(AllowanceSection, { child }))
    expect(screen.getByText(t.allowance.statusPaused)).toBeTruthy()
  })

  it('opens the shared dialog from the profile', () => {
    render(createElement(AllowanceSection, { child }))
    fireEvent.click(screen.getByRole('button', { name: t.allowance.setUp }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByLabelText(t.allowance.frequency)).toBeTruthy()
  })

  it('never offers the allowance for adults, nor to the child themselves', () => {
    expect(canManageAllowance(admin, child)).toBe(true)
    expect(canManageAllowance(parent, child)).toBe(true)
    expect(canManageAllowance(admin, parent)).toBe(false)
    expect(canManageAllowance(admin, admin)).toBe(false)
    expect(canManageAllowance(child, child)).toBe(false)
    expect(canManageAllowance(admin, { ...child, family_id: 'other-family' })).toBe(false)
  })

  it('lists every child in family settings with its state and action', () => {
    allowanceState.allowancePlans = [weeklyPlan]
    const second: FamilyMember = { ...child, id: 'child-2', display_name: 'Bára' }
    render(createElement('ul', null, createElement(FamilyAllowanceSettings, {
      childMembers: [child, second], onEdit: vi.fn(),
    })))
    expect(screen.getByRole('button', { name: t.allowance.editFor('Alex') })).toBeTruthy()
    expect(screen.getByRole('button', { name: t.allowance.setUpFor('Bára') })).toBeTruthy()
    expect(screen.getByText(t.allowance.notSet)).toBeTruthy()
  })

  it('reports a load failure instead of an empty allowance state', () => {
    allowanceState.allowanceError = 'boom'
    render(createElement('ul', null, createElement(FamilyAllowanceSettings, { childMembers: [child], onEdit: vi.fn() })))
    expect(screen.getByRole('alert')).toBeTruthy()
  })
})
