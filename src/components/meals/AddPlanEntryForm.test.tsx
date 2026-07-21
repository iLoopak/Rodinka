// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../strings'
import { makeMeal, makeMealPlanEntry } from '../../utils/testFixtures'
import { AddPlanEntryForm } from './AddPlanEntryForm'

afterEach(cleanup)

describe('AddPlanEntryForm edit integrity', () => {
  it('does not automatically select the first library meal for a new entry', () => {
    const historicalMeal = makeMeal({ id: 'historical-meal', name: 'Buřtguláš' })
    render(<AddPlanEntryForm meals={[historicalMeal]} members={[]} planEntries={[]} onSubmit={vi.fn()} />)
    expect(screen.getByLabelText<HTMLSelectElement>(t.mealPlan.useLibraryMealLabel).value).toBe('')
  })

  it('preserves a custom planned meal when an unrelated field is edited', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const initial = makeMealPlanEntry({ meal_id: null, title: 'Kuře', notes: null })
    const historicalMeal = makeMeal({ id: 'historical-meal', name: 'Buřtguláš' })
    render(<AddPlanEntryForm meals={[historicalMeal]} members={[]} planEntries={[]} initial={initial} onSubmit={onSubmit} />)
    expect(screen.getByDisplayValue('Kuře')).toBeTruthy()
    expect(screen.queryByDisplayValue('Buřtguláš')).toBeNull()
    fireEvent.change(screen.getByLabelText(t.mealPlan.notesLabel), { target: { value: 'Bez cibule' } })
    fireEvent.click(screen.getByRole('button', { name: t.mealPlan.submitSave }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ mealId: null, title: 'Kuře', notes: 'Bez cibule' }))
  })

  it('preserves the selected library meal and its saved title snapshot', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const historicalMeal = makeMeal({ id: 'historical-meal', name: 'Buřtguláš' })
    const selectedMeal = makeMeal({ id: 'selected-meal', name: 'Nový název kuřete' })
    const initial = makeMealPlanEntry({ meal_id: selectedMeal.id, title: 'Kuře', responsible_member_id: null })
    render(<AddPlanEntryForm meals={[historicalMeal, selectedMeal]} members={[]} planEntries={[]} initial={initial} onSubmit={onSubmit} />)
    expect(screen.getByLabelText<HTMLSelectElement>(t.mealPlan.useLibraryMealLabel).value).toBe(selectedMeal.id)
    fireEvent.change(screen.getByLabelText(t.mealPlan.notesLabel), { target: { value: 'Příloha rýže' } })
    fireEvent.click(screen.getByRole('button', { name: t.mealPlan.submitSave }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ mealId: selectedMeal.id, title: 'Kuře', notes: 'Příloha rýže' }))
  })

  it('keeps an archived assigned meal available instead of falling back to an active one', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const activeMeal = makeMeal({ id: 'active-meal', name: 'Buřtguláš' })
    const archivedMeal = makeMeal({ id: 'archived-meal', name: 'Kuře', status: 'archived' })
    const initial = makeMealPlanEntry({ meal_id: archivedMeal.id, title: 'Kuře' })
    render(<AddPlanEntryForm meals={[activeMeal, archivedMeal]} members={[]} planEntries={[]} initial={initial} onSubmit={onSubmit} />)
    const select = screen.getByLabelText<HTMLSelectElement>(t.mealPlan.useLibraryMealLabel)
    expect(select.value).toBe(archivedMeal.id)
    expect(screen.getByRole('option', { name: 'Kuře' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t.mealPlan.submitSave }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ mealId: archivedMeal.id, title: 'Kuře' }))
  })

  it('offers library saving for a new custom meal and submits the selection', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<AddPlanEntryForm meals={[]} members={[]} planEntries={[]} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('tab', { name: t.mealPlan.useCustomTitleAction }))
    fireEvent.change(screen.getByLabelText(t.mealPlan.customTitleLabel), { target: { value: 'Tacos' } })
    const checkbox = screen.getByLabelText<HTMLInputElement>(t.mealPlan.saveToLibraryLabel)
    expect(checkbox.checked).toBe(false)
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: t.mealPlan.submitAdd }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Tacos', mealId: null, saveToLibrary: true }))
  })

  it('does not show the library-save toggle while editing a planned meal', () => {
    const initial = makeMealPlanEntry({ meal_id: null, title: 'Kuře' })
    render(<AddPlanEntryForm meals={[]} members={[]} planEntries={[]} initial={initial} onSubmit={vi.fn()} />)
    expect(screen.queryByLabelText(t.mealPlan.saveToLibraryLabel)).toBeNull()
  })
})
