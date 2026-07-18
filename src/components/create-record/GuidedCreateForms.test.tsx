// @vitest-environment jsdom

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../strings'
import { makeFamilyMember, makeMeal } from '../../utils/testFixtures'
import { AddActivityForm } from '../AddActivityForm'
import { AddChoreForm } from '../AddChoreForm'
import { AddMedicalRecordForm } from '../AddMedicalRecordForm'
import { AddMealForm } from '../meals/AddMealForm'
import { AddPlanEntryForm } from '../meals/AddPlanEntryForm'
import { CreateRoundForm } from '../meals/CreateRoundForm'
import { ShoppingItemForm } from '../shopping/ShoppingItemForm'

const parent = makeFamilyMember({ id: 'parent-1', display_name: 'Lukáš', role: 'admin' })
const child = makeFamilyMember({ id: 'child-1', display_name: 'Anička', role: 'child' })
const members = [parent, child]
const meal = makeMeal({ id: 'meal-1', name: 'Špagety' })

afterEach(cleanup)

describe('guided record creation forms', () => {
  it('keeps task, activity, and health creation focused on essentials', () => {
    const task = renderToStaticMarkup(createElement(AddChoreForm, {
      members,
      currentMemberId: parent.id,
      variant: 'guided',
      onSubmit: vi.fn(),
    }))
    const activity = renderToStaticMarkup(createElement(AddActivityForm, {
      members,
      kids: [child],
      variant: 'guided',
      onSubmit: vi.fn(),
    }))
    const medical = renderToStaticMarkup(createElement(AddMedicalRecordForm, {
      members,
      currentMemberId: parent.id,
      variant: 'guided',
      onSubmit: vi.fn(),
    }))

    for (const html of [task, activity, medical]) {
      expect(html).toContain('guided-create-form')
      expect(html).toContain(t.create.guided.addDetails)
      expect(html).toContain(t.create.guided.today)
      expect(html).toContain(t.create.guided.tomorrow)
    }
    expect(task).not.toContain(t.chores.addReward)
    expect(activity).not.toContain(t.activities.trackPayments)
    expect(medical).not.toContain(t.medical.providerLabel)
  })

  it('gives meals and shopping a lightweight primary path', () => {
    const plan = renderToStaticMarkup(createElement(AddPlanEntryForm, {
      meals: [meal],
      members,
      planEntries: [],
      variant: 'guided',
      onSubmit: vi.fn(),
    }))
    const shopping = renderToStaticMarkup(createElement(ShoppingItemForm, {
      members,
      variant: 'guided',
      onSubmit: vi.fn(),
    }))
    const library = renderToStaticMarkup(createElement(AddMealForm, {
      variant: 'guided',
      onSubmit: vi.fn(),
    }))

    expect(plan).toContain(t.create.guided.mealPrompt)
    expect(plan).not.toContain(t.mealPlan.responsibleLabel)
    expect(shopping).toContain(t.create.guided.shoppingPrompt)
    expect(shopping).not.toContain(t.shopping.responsibleLabel)
    expect(library).toContain(t.create.guided.libraryPrompt)
    expect(library).not.toContain(t.mealLibrary.sourceUrlLabel)
  })

  it('reduces meal voting to candidates plus a direct outcome', () => {
    const vote = renderToStaticMarkup(createElement(CreateRoundForm, {
      meals: [meal],
      variant: 'guided',
      onSubmit: vi.fn(),
    }))

    expect(vote).toContain(t.create.guided.votePrompt)
    expect(vote).toContain('Špagety')
    expect(vote).toContain(t.create.guided.saveVoteDraft)
    expect(vote).toContain(t.create.guided.startVote)
    expect(vote).not.toContain(t.mealVoting.reviewAndOpenTitle)
  })

  it('reveals optional fields only when requested', () => {
    render(createElement(ShoppingItemForm, { members, variant: 'guided', onSubmit: vi.fn() }))

    expect(screen.queryByText(t.shopping.responsibleLabel)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: t.create.guided.addDetails }))
    expect(screen.getByText(t.shopping.responsibleLabel)).toBeTruthy()
  })

  it('creates a useful health title from the selected visit type', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const { container } = render(createElement(AddMedicalRecordForm, {
      members,
      currentMemberId: parent.id,
      variant: 'guided',
      onSubmit,
    }))

    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].title).toBe(t.medical.typeCheckup)
  })
})
