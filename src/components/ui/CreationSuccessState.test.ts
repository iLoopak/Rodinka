// @vitest-environment jsdom
import { createElement } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { CreationSuccessState } from './CreationSuccessState'
import { t } from '../../strings'

describe('CreationSuccessState', () => {
  afterEach(cleanup)

  it('shows the title, optional body, and a single Done button', () => {
    render(createElement(CreationSuccessState, { title: 'Meal added', body: 'Beans are planned for tomorrow.', onDone: vi.fn() }))
    expect(screen.getByRole('heading', { name: 'Meal added' })).toBeTruthy()
    expect(screen.getByText('Beans are planned for tomorrow.')).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('omits the body paragraph entirely when none is given', () => {
    const { container } = render(createElement(CreationSuccessState, { title: 'Done', onDone: vi.fn() }))
    expect(container.querySelector('.creation-success-state p')).toBeNull()
  })

  it('defaults the button label to the shared "Done" string, calls onDone on click', () => {
    const onDone = vi.fn()
    render(createElement(CreationSuccessState, { title: 'Done', onDone }))
    const button = screen.getByRole('button', { name: t.create.doneAction })
    fireEvent.click(button)
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('marks the button with a real autofocus attribute so Modal focuses it over its close button', () => {
    render(createElement(CreationSuccessState, { title: 'Done', onDone: vi.fn() }))
    expect(screen.getByRole('button').hasAttribute('autofocus')).toBe(true)
  })
})
