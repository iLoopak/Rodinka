import { describe, expect, it, vi } from 'vitest'

function query(result: unknown) {
  return { select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(async () => result) })) })) }
}

describe('medicalRepository', () => {
  it('scopes list by family and returns domain records', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
    const { createMedicalRepository } = await import('./medicalRepository')
    const row = { id: 'record-1', family_id: 'family-1', patient_id: 'member-1', record_type: 'checkup', title: 'Checkup', record_date: '2026-01-01' }
    const table = query({ data: [row], error: null })
    const client = { from: vi.fn(() => table) }
    const repository = createMedicalRepository({ familyId: 'family-1', userId: 'user-1', supabaseClient: client as never })

    await expect(repository.list()).resolves.toEqual([row])
    expect(client.from).toHaveBeenCalledWith('medical_records')
    expect(table.select).toHaveBeenCalled()
  })
})
