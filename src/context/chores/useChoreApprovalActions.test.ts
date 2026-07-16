// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const useChoresDataMock = vi.hoisted(() => vi.fn())
const useAllowanceDataMock = vi.hoisted(() => vi.fn())
vi.mock('./ChoresContext', () => ({ useChoresData: useChoresDataMock }))
vi.mock('./AllowanceContext', () => ({ useAllowanceData: useAllowanceDataMock }))

const { useChoreApprovalActions } = await import('./useChoreApprovalActions')

function stub() {
  const approve = vi.fn().mockResolvedValue({ choreId: 'chore-1', nextDueDate: null })
  const markDone = vi.fn().mockResolvedValue(undefined)
  const refreshLedger = vi.fn().mockResolvedValue(undefined)
  useChoresDataMock.mockReturnValue({ approve, markDone })
  useAllowanceDataMock.mockReturnValue({ refreshLedger })
  return { approve, markDone, refreshLedger }
}

describe('useChoreApprovalActions', () => {
  it('approve refreshes the allowance ledger after the chore RPC resolves', async () => {
    const { approve, refreshLedger } = stub()
    const { result } = renderHook(() => useChoreApprovalActions())

    const approvalResult = await result.current.approve('completion-1')

    expect(approve).toHaveBeenCalledWith('completion-1')
    expect(refreshLedger).toHaveBeenCalledTimes(1)
    expect(approvalResult).toEqual({ choreId: 'chore-1', nextDueDate: null })
  })

  it('markDone refreshes the allowance ledger after the chore RPC resolves', async () => {
    const { markDone, refreshLedger } = stub()
    const { result } = renderHook(() => useChoreApprovalActions())

    await result.current.markDone('chore-1', undefined, '2026-07-16')

    expect(markDone).toHaveBeenCalledWith('chore-1', undefined, '2026-07-16')
    expect(refreshLedger).toHaveBeenCalledTimes(1)
  })

  it('reject is not part of the approval composition (chores-only, no ledger impact)', () => {
    stub()
    const { result } = renderHook(() => useChoreApprovalActions())
    expect(result.current).not.toHaveProperty('reject')
  })
})
