// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

describe('Modal', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  it('has a programmatic name and description', () => {
    render(
      <Modal title="Remove member" descriptionId="impact" onClose={vi.fn()}>
        <p id="impact">The member loses access.</p>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Remove member' })
    expect(dialog.getAttribute('aria-describedby')).toBe('impact')
    expect(dialog.parentElement?.parentElement).toBe(document.body)
    expect(document.body.classList.contains('has-modal-open')).toBe(true)
  })

  it('traps focus and returns it to the trigger', () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    const view = render(
      <Modal title="Edit" onClose={vi.fn()}>
        <button>First</button>
        <button>Last</button>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Edit' })
    const close = dialog.querySelector<HTMLButtonElement>('.modal-close')!
    const last = screen.getByRole('button', { name: 'Last' })
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    view.unmount()
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it('shows an optional header icon without changing the accessible name', () => {
    render(
      <Modal title="Swimming" icon={<span>🏊</span>} onClose={vi.fn()}>
        <p>Body</p>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Swimming' })
    const icon = dialog.querySelector('.modal-header-icon')
    expect(icon?.getAttribute('aria-hidden')).toBe('true')
    expect(icon?.textContent).toBe('🏊')
  })

  it('renders no header icon element when none is given', () => {
    render(
      <Modal title="No Icon Here" onClose={vi.fn()}>
        <p>Body</p>
      </Modal>,
    )
    expect(screen.getByRole('dialog', { name: 'No Icon Here' }).querySelector('.modal-header-icon')).toBeNull()
  })

  it('refocuses the new content when the title changes mid-lifetime (e.g. a wizard swapping to a success screen)', () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()

    const view = render(
      <Modal title="Add item" onClose={vi.fn()}>
        <input placeholder="Name" />
        <button>Submit</button>
      </Modal>,
    )
    screen.getByRole('button', { name: 'Submit' }).focus()

    // A real `autofocus` DOM attribute (not React's `autoFocus` prop, which
    // only calls .focus() once during its own commit and leaves no queryable
    // attribute behind) is what lets this jump ahead of the modal's own
    // close button in `focusableSelector`'s DOM-order query.
    view.rerender(
      <Modal title="Item added" onClose={vi.fn()}>
        <button ref={(el) => el?.setAttribute('autofocus', '')}>Done</button>
      </Modal>,
    )
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Done' }))

    view.unmount()
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it('only lets the topmost modal handle Escape', () => {
    const closeParent = vi.fn()
    const closeChild = vi.fn()
    render(
      <Modal title="Parent" onClose={closeParent}>
        <Modal title="Child" onClose={closeChild}>
          <span>Body</span>
        </Modal>
      </Modal>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(closeChild).toHaveBeenCalledOnce()
    expect(closeParent).not.toHaveBeenCalled()
  })
})
