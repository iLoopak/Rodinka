// @vitest-environment jsdom
//
// Detail/edit modals seed local form state (most importantly the `editing`
// mode flag) straight from an entity prop, with no `useEffect` sync back to
// the entity's id. If a screen ever reassigns its `selected` entity from one
// non-null value directly to a different non-null value (already possible,
// e.g. via a deep-link effect) without the entity id changing the element's
// `key`, React reuses the same component instance and the previous entity's
// edit state leaks into the new one. The fix is the `key={entity.id}`
// convention already used by ChoresScreen — this file locks in both halves:
// the callers apply it (source checks) and the mechanism actually works
// (behavioral checks, including what breaks without it).
import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from './strings'
import { makeActivity, makeFamilyMember, makeMeal } from './utils/testFixtures'

vi.mock('./context/family/FamilyCoreContext', () => ({
  useFamilyCore: () => ({ currentMember: makeFamilyMember({ id: 'adult-1', role: 'parent' }), isParentOrAdmin: true }),
}))
vi.mock('./components/ui/ShareLinkButton', () => ({ ShareLinkButton: () => null }))
vi.mock('./components/messages/ShareToChatButton', () => ({ ShareToChatButton: () => null }))
vi.mock('./components/meals/MealIngredientsSection', () => ({ MealIngredientsSection: () => null }))

vi.mock('./hooks/useMemberProfiles', async () => {
  const actual = await vi.importActual<typeof import('./hooks/useMemberProfiles')>('./hooks/useMemberProfiles')
  return { ...actual, useMemberProfiles: () => ({ saveMemberProfile: vi.fn().mockResolvedValue(undefined) }) }
})
vi.mock('./supabaseClient', () => ({ supabase: { functions: { invoke: vi.fn() } } }))
vi.mock('./context/chores/AllowanceContext', () => ({
  useAllowanceData: () => ({ allowancePlans: [], allowanceLoading: false, allowanceError: null, saveAllowancePlan: vi.fn(), deleteAllowancePlan: vi.fn() }),
}))
vi.mock('./context/chores/ChoresContext', () => ({ useChoresData: () => ({ chores: [] }) }))
vi.mock('./components/ui/MemberAvatar', () => ({ MemberAvatar: () => null }))

import { ActivityDetailModal } from './components/ActivityDetailModal'
import { MealDetailModal } from './components/meals/MealDetailModal'
import { MemberProfileModal } from './components/family/MemberProfileModal'

afterEach(cleanup)

function heading() {
  return screen.getByRole('heading', { level: 2 }).textContent
}

describe('key={entity.id} is wired at every detail/edit modal call site', () => {
  const check = (path: string, keyExpr: string, componentTag: string) => {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    const openTag = source.indexOf(`<${componentTag}`)
    expect(openTag, `${componentTag} usage not found in ${path}`).toBeGreaterThan(-1)
    // The key prop must appear on the same element, i.e. before the tag closes.
    const tagClose = source.indexOf('>', openTag)
    const tagBody = source.slice(openTag, tagClose)
    expect(tagBody, `${componentTag} in ${path} is missing key={${keyExpr}}`).toContain(`key={${keyExpr}}`)
  }

  it('ActivitiesScreen keys ActivityDetailModal by activity id', () => {
    check('./components/ActivitiesScreen.tsx', 'selectedActivity.id', 'ActivityDetailModal')
  })

  it('MealLibraryTab keys MealDetailModal by meal id', () => {
    check('./components/meals/MealLibraryTab.tsx', 'selectedMeal.id', 'MealDetailModal')
  })

  it('FamilyScreen and MoreScreen key MemberProfileModal by member id', () => {
    check('./components/FamilyScreen.tsx', 'editingMember.id', 'MemberProfileModal')
    check('./components/MoreScreen.tsx', 'currentMember.id', 'MemberProfileModal')
  })

  it('every AllowancePlanDialog call site keys by child id', () => {
    check('./components/AllowanceBalances.tsx', 'kid.id', 'AllowancePlanDialog')
    check('./components/family/AllowanceSection.tsx', 'child.id', 'AllowancePlanDialog')
    check('./components/MoreScreen.tsx', 'allowanceChild.id', 'AllowancePlanDialog')
  })
})

describe('ActivityDetailModal: switching entities does not leak edit mode', () => {
  const activityA = makeActivity({ id: 'activity-a', title: 'Swimming' })
  const activityB = makeActivity({ id: 'activity-b', title: 'Football' })
  const baseProps = {
    members: [], kids: [], memberName: () => '', memberById: () => undefined,
    onUpdate: vi.fn().mockResolvedValue(undefined), onMarkPaymentPaid: vi.fn().mockResolvedValue(undefined), onClose: vi.fn(),
  }

  it('keyed by id: opening edit on A, then switching to B, lands back on B\'s detail view', () => {
    const { rerender } = render(<ActivityDetailModal key={activityA.id} activity={activityA} {...baseProps} />)
    expect(heading()).toBe('Swimming')

    fireEvent.click(screen.getByRole('button', { name: t.activities.edit }))
    expect(heading()).toBe(t.activities.editTitle)

    rerender(<ActivityDetailModal key={activityB.id} activity={activityB} {...baseProps} />)
    // Remounted: back to B's detail view, not stuck showing A's edit form.
    expect(heading()).toBe('Football')
  })

  it('regression guard: without a key, switching to B while editing A stays stuck in edit mode', () => {
    const { rerender } = render(<ActivityDetailModal activity={activityA} {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: t.activities.edit }))
    expect(heading()).toBe(t.activities.editTitle)

    rerender(<ActivityDetailModal activity={activityB} {...baseProps} />)
    // Same component instance reused: the stale `editing` flag from A leaks
    // onto B. This is the bug the key convention exists to prevent.
    expect(heading()).toBe(t.activities.editTitle)
  })
})

describe('MealDetailModal: switching entities does not leak edit mode', () => {
  const mealA = makeMeal({ id: 'meal-a', name: 'Pancakes' })
  const mealB = makeMeal({ id: 'meal-b', name: 'Soup' })
  const baseProps = { onUpdate: vi.fn().mockResolvedValue(undefined), onClose: vi.fn() }

  it('keyed by id: opening edit on A, then switching to B, lands back on B\'s detail view', () => {
    const { rerender } = render(<MealDetailModal key={mealA.id} meal={mealA} {...baseProps} />)
    expect(heading()).toBe('Pancakes')

    fireEvent.click(screen.getByRole('button', { name: t.mealLibrary.edit }))
    expect(heading()).toBe(t.mealLibrary.editTitle)

    rerender(<MealDetailModal key={mealB.id} meal={mealB} {...baseProps} />)
    expect(heading()).toBe('Soup')
  })

  it('regression guard: without a key, switching to B while editing A stays stuck in edit mode', () => {
    const { rerender } = render(<MealDetailModal meal={mealA} {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: t.mealLibrary.edit }))
    expect(heading()).toBe(t.mealLibrary.editTitle)

    rerender(<MealDetailModal meal={mealB} {...baseProps} />)
    expect(heading()).toBe(t.mealLibrary.editTitle)
  })
})

describe('MemberProfileModal: switching members does not leak pending edits', () => {
  const memberA = makeFamilyMember({ id: 'member-a', display_name: 'Alex', role: 'child' })
  const memberB = makeFamilyMember({ id: 'member-b', display_name: 'Blake', role: 'child' })
  const admin = makeFamilyMember({ id: 'admin-1', role: 'admin' })
  const baseProps = { currentMember: admin, refreshMembers: vi.fn().mockResolvedValue(undefined), onClose: vi.fn() }

  it('keyed by id: editing A\'s name, then switching to B, shows B\'s own name (not A\'s pending edit)', () => {
    const { rerender } = render(<MemberProfileModal key={memberA.id} member={memberA} {...baseProps} />)
    const nameInput = screen.getByLabelText(t.family.nameLabel) as HTMLInputElement
    expect(nameInput.value).toBe('Alex')
    fireEvent.change(nameInput, { target: { value: 'Alexandra' } })

    rerender(<MemberProfileModal key={memberB.id} member={memberB} {...baseProps} />)
    const restarted = screen.getByLabelText(t.family.nameLabel) as HTMLInputElement
    expect(restarted.value).toBe('Blake')
  })

  it('regression guard: without a key, switching to B keeps showing A\'s unsaved edit', () => {
    const { rerender } = render(<MemberProfileModal member={memberA} {...baseProps} />)
    const nameInput = screen.getByLabelText(t.family.nameLabel) as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'Alexandra' } })

    rerender(<MemberProfileModal member={memberB} {...baseProps} />)
    const stillA = screen.getByLabelText(t.family.nameLabel) as HTMLInputElement
    // Same instance reused: local state still holds A's edited value even
    // though the `member` prop now points at B.
    expect(stillA.value).toBe('Alexandra')
  })
})
