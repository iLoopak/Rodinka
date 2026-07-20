import { describe, expect, it } from 'vitest'
import { classifySupabaseRequest } from './startupDiagnostics'

describe('startup request diagnostics', () => {
  it('classifies REST reads without retaining filters or payload data', () => {
    expect(classifySupabaseRequest(
      'https://example.supabase.co/rest/v1/child_accounts?member_id=in.(private-id)',
      'GET',
    )).toEqual({ kind: 'read', resource: 'child_accounts' })
  })

  it('classifies signed URL operations separately', () => {
    expect(classifySupabaseRequest(
      'https://example.supabase.co/storage/v1/object/sign/member-avatars/private-path',
      'POST',
    )).toEqual({ kind: 'signed-url', resource: 'storage-object' })
  })

  it('ignores mutations and unknown requests', () => {
    expect(classifySupabaseRequest('https://example.supabase.co/rest/v1/shopping_items', 'POST')).toEqual({ kind: 'other', resource: null })
    expect(classifySupabaseRequest('https://example.test/page', 'GET')).toEqual({ kind: 'other', resource: null })
  })
})
