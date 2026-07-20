import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath: string) => JSON.parse(readFileSync(join(root, relativePath), 'utf8'))

function runGuard(args: string[] = []) {
  try {
    return { code: 0, output: execFileSync('node', ['scripts/audit-data-access.mjs', ...args], { cwd: root, encoding: 'utf8' }) }
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string }
    return { code: failure.status ?? 1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` }
  }
}

describe('data access guard', () => {
  it('passes on the current tree', () => {
    // If this fails, either a new direct Supabase call appeared outside the
    // data layer, or a wave removed debt without regenerating the baseline.
    const { code, output } = runGuard(['--check'])
    expect(output).toContain('Data access guard passed')
    expect(code).toBe(0)
  })

  it('keeps the allowlist specific rather than a blanket over src', () => {
    const allowlist = read('scripts/data-access-allowlist.json')
    expect(allowlist.exceptions.length).toBeGreaterThan(0)
    for (const exception of allowlist.exceptions) {
      // An entry like `src/**` would silently retire the whole guard.
      expect(exception.path).not.toBe('src/**')
      expect(exception.path).not.toBe('**')
      expect(exception.reason).toBeTruthy()
      expect(exception.owner).toBeTruthy()
    }
  })

  it('records the debt the waves are expected to pay down', () => {
    const baseline = read('scripts/data-access-baseline.json')
    const signatures = Object.keys(baseline.entries)
    expect(signatures.length).toBeGreaterThan(0)
    // Keyed by file and target rather than line number, so moving code inside
    // a file does not spuriously fail the guard.
    for (const signature of signatures) expect(signature).toMatch(/^[^:]+::(table|rpc|channel|storage)::/)
  })

  it('does not count Array.from as a table read', () => {
    // The whole reason this is an AST walk and not a regex.
    const report = read('docs/audits/data-access-report.json')
    const suspicious = report.findings.filter((finding: { target: string | null }) =>
      finding.target !== null && /^<dynamic:(Array|Object|JSON)/.test(finding.target))
    expect(suspicious).toEqual([])
  })

  it('classifies a storage bucket as storage, not as a table', () => {
    const report = read('docs/audits/data-access-report.json')
    const buckets = report.findings.filter((finding: { target: string | null }) =>
      finding.target === 'member-avatars' || finding.target === 'family-hero-images')
    expect(buckets.length).toBeGreaterThan(0)
    for (const bucket of buckets) expect(bucket.kind).toBe('storage')
  })
})
