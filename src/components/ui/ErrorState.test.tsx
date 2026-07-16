// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { t } from '../../strings'
import { ErrorState } from './ErrorState'

describe('ErrorState', () => {
  it('announces the error and prevents duplicate retries', async () => {
    let finish!: () => void
    const onRetry = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    render(<ErrorState message="Could not load" onRetry={onRetry} />)
    const button = screen.getByRole('button', { name: t.errors.retry })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(onRetry).toHaveBeenCalledOnce()
    expect((screen.getByRole('button', { name: t.errors.retrying }) as HTMLButtonElement).disabled).toBe(true)
    finish()
    await waitFor(() => expect(screen.getByRole('button', { name: t.errors.retry })).toBeTruthy())
  })
})
