import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./useChildAccounts.ts', import.meta.url), 'utf8')
// Comments in the hook name the forbidden columns to explain why they are
// absent, so this reads the actual select list rather than the whole file.
const selectedColumns = (/const SAFE_COLUMNS = '([^']+)'/.exec(source)?.[1] ?? '')
  .split(',')
  .map((column) => column.trim())

describe('useChildAccounts column selection', () => {
  it('never reads internal Auth identifiers into the client', () => {
    // RLS lets adults read these columns; keeping them out of the select is
    // what stops them reaching a render, a log, or an error payload.
    expect(selectedColumns).not.toContain('internal_identifier')
    expect(selectedColumns).not.toContain('auth_user_id')
  })

  it('selects only the columns the account UI presents', () => {
    expect([...selectedColumns].sort()).toEqual([
      'activated_at', 'login_name', 'member_id', 'password_reset_at', 'revoked_at', 'status',
    ])
  })

  it('reads child_accounts through exactly one query', () => {
    expect(source.match(/\.from\('child_accounts'\)/g)).toHaveLength(1)
    expect(source).toContain('.select(SAFE_COLUMNS)')
  })
})
