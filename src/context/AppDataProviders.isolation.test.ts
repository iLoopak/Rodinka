// @vitest-environment jsdom
import { createElement, useState, type ReactNode } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

// Mocking at the domain-hook boundary (not Supabase) keeps this test focused
// on what it's actually verifying: that the *provider composition* (separate
// React contexts, nested via a stable `children` reference) isolates renders
// and loading/error state between features. The domain hooks themselves
// (useMedicalRecords, useChores, ...) already fetch real data elsewhere and
// aren't what's under test here.
vi.mock('../hooks/useMedicalRecords', () => ({
  useMedicalRecords: vi.fn(),
}))
vi.mock('../hooks/useChores', () => ({
  useChores: vi.fn(),
}))
vi.mock('../hooks/useChoreCompletions', () => ({
  useChoreCompletions: vi.fn(),
}))
vi.mock('./shopping/useShoppingDataSource', () => ({
  // A real mini-hook (not a static mock) so calling addShoppingItem actually
  // changes ShoppingProvider's own state and triggers a re-render of it —
  // exactly what happens in production when a mutation resolves.
  useShoppingDataSource: () => {
    const [items, setItems] = useState<{ name: string }[]>([])
    return {
      activeShoppingItems: items,
      shoppingLoading: false,
      shoppingError: null,
      addShoppingItem: (input: { name: string }) => {
        setItems((current) => [...current, input])
        return Promise.resolve({ action: 'added' as const })
      },
    }
  },
}))

const { useMedicalRecords } = await import('../hooks/useMedicalRecords')
const { useChores } = await import('../hooks/useChores')
const { useChoreCompletions } = await import('../hooks/useChoreCompletions')
const { MedicalProvider, useMedicalData } = await import('./health/MedicalContext')
const { ShoppingProvider, useShopping } = await import('./shopping/ShoppingContext')
const { ChoresProvider, useChoresData } = await import('./chores/ChoresContext')

function stubMedical(overrides: Partial<ReturnType<typeof useMedicalRecords>> = {}) {
  vi.mocked(useMedicalRecords).mockReturnValue({
    medicalRecords: [], setMedicalRecords: vi.fn(), loading: false, error: null, refresh: vi.fn(), ...overrides,
  })
}

function stubChores() {
  vi.mocked(useChores).mockReturnValue({ chores: [], setChores: vi.fn(), loading: false, error: null, refresh: vi.fn(), reorder: vi.fn() })
  vi.mocked(useChoreCompletions).mockReturnValue({ completions: [], setCompletions: vi.fn(), loading: false, error: null, refresh: vi.fn() })
}

let medicalRenderCount = 0
function MedicalConsumer() {
  medicalRenderCount += 1
  const { medicalRecords } = useMedicalData()
  return createElement('div', { 'data-testid': 'medical' }, medicalRecords.length)
}

function ShoppingConsumer() {
  const { activeShoppingItems, addShoppingItem } = useShopping()
  return createElement('div', null, [
    createElement('span', { key: 'count', 'data-testid': 'shopping-count' }, activeShoppingItems.length),
    createElement('button', {
      key: 'add',
      onClick: () => void addShoppingItem({ name: 'Milk', quantity: null, unit: null, note: '', category: 'other', responsibleMemberId: null }),
    }, 'add'),
  ])
}

function MedicalShoppingTree({ children }: { children?: ReactNode }) {
  return createElement(MedicalProvider, { familyId: 'family-1', userId: 'user-1', children:
    createElement(ShoppingProvider, { familyId: 'family-1', currentMemberId: 'member-1', children }) })
}

describe('provider isolation: Shopping mutation vs. Medical consumer', () => {
  it('does not re-render a medical-only consumer when a shopping item is added', async () => {
    stubMedical()
    medicalRenderCount = 0
    render(createElement(MedicalShoppingTree, null,
      createElement('div', null, [createElement(MedicalConsumer, { key: 'm' }), createElement(ShoppingConsumer, { key: 's' })])))

    const rendersAfterMount = medicalRenderCount
    expect(rendersAfterMount).toBeGreaterThan(0)

    await act(async () => {
      screen.getByText('add').click()
    })

    expect(screen.getByTestId('shopping-count').textContent).toBe('1')
    expect(medicalRenderCount).toBe(rendersAfterMount)
  })

  it('renders the shopping consumer even while the medical provider is in an error state', () => {
    stubMedical({ error: 'boom', loading: false })
    render(createElement(MedicalShoppingTree, null, createElement(ShoppingConsumer)))
    expect(screen.getByTestId('shopping-count').textContent).toBe('0')
  })

  it('renders the shopping consumer while the medical provider is still loading', () => {
    stubMedical({ loading: true })
    render(createElement(MedicalShoppingTree, null, createElement(ShoppingConsumer)))
    expect(screen.getByTestId('shopping-count').textContent).toBe('0')
  })
})

describe('provider isolation: Chores mutation vs. unrelated consumer', () => {
  it('does not re-render a chores-only consumer when an unrelated (medical) provider updates', async () => {
    stubChores()
    stubMedical()

    let choresRenderCount = 0
    function ChoresConsumer() {
      choresRenderCount += 1
      const { chores } = useChoresData()
      return createElement('div', { 'data-testid': 'chores' }, chores.length)
    }

    render(
      createElement(ChoresProvider, {
        familyId: 'family-1', userId: 'user-1', currentMemberId: 'member-1', children:
        createElement(MedicalProvider, {
          familyId: 'family-1', userId: 'user-1', children:
          createElement('div', null, [
            createElement(ChoresConsumer, { key: 'c' }),
            createElement(ShoppingProvider, { key: 's', familyId: 'family-1', currentMemberId: 'member-1', children: createElement(ShoppingConsumer) }),
          ]),
        }),
      })
    )

    const rendersAfterMount = choresRenderCount
    await act(async () => {
      screen.getByText('add').click()
    })
    expect(choresRenderCount).toBe(rendersAfterMount)
  })
})
