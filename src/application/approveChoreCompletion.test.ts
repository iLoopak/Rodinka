import { describe, expect, it, vi } from 'vitest'
import type { ChoreApprovalResult } from '../domain/chores/types'
import type { ChoresRepository } from '../repositories/chores/choresRepository'
import { approveChoreCompletion } from './approveChoreCompletion'

function createChoresRepository(overrides: Partial<ChoresRepository> = {}): ChoresRepository {
  return {
    create: vi.fn(),
    update: vi.fn(),
    setArchived: vi.fn(),
    completeOccurrence: vi.fn(),
    approveCompletion: vi.fn(),
    rejectCompletion: vi.fn(),
    subscribeToChanges: vi.fn(() => () => {}),
    toSafeError: vi.fn((error: unknown) => error as Error),
    ...overrides,
  }
}

describe('approveChoreCompletion', () => {
  it('approves through the repository and returns its result', async () => {
    const result: ChoreApprovalResult = { choreId: 'chore-1', nextDueDate: '2026-08-01' }
    const approveCompletion = vi.fn(async () => result)
    const reconcile = vi.fn(async () => {})
    const choresRepository = createChoresRepository({ approveCompletion })

    const returned = await approveChoreCompletion({ choresRepository, reconcile }, 'completion-9')

    expect(approveCompletion).toHaveBeenCalledWith('completion-9')
    expect(returned).toBe(result)
  })

  it('reconciles after approval so callers see refreshed state', async () => {
    const order: string[] = []
    const approveCompletion = vi.fn(async () => {
      order.push('approve')
      return { choreId: 'c', nextDueDate: null }
    })
    const reconcile = vi.fn(async () => {
      order.push('reconcile')
    })

    await approveChoreCompletion(
      { choresRepository: createChoresRepository({ approveCompletion }), reconcile },
      'completion-1',
    )

    expect(order).toEqual(['approve', 'reconcile'])
  })

  it('propagates a repository failure without reconciling', async () => {
    const failure = new Error('permission-denied')
    const approveCompletion = vi.fn(async () => {
      throw failure
    })
    const reconcile = vi.fn(async () => {})

    await expect(
      approveChoreCompletion(
        { choresRepository: createChoresRepository({ approveCompletion }), reconcile },
        'completion-1',
      ),
    ).rejects.toBe(failure)
    expect(reconcile).not.toHaveBeenCalled()
  })
})
