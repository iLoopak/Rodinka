// Runs the child-account authorization matrix against a LOCAL Supabase stack.
//
// Guard rails, in order of importance: this script writes synthetic auth users
// and families, so it refuses to run against anything that is not localhost. A
// remote URL is a hard error, never a prompt.
//
//   npx supabase start && npx supabase db reset
//   npm run test:db

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

// Each suite is self-contained and rolls back, so they can run in any order
// against the same reset database.
const SUITES = [
  { name: 'Child account authorization matrix', path: 'supabase/tests/child_account_authorization.sql' },
  { name: 'Messaging push fan-out', path: 'supabase/tests/messaging_push_notifications.sql' },
]
const LOCAL_DB_URL = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function fail(message) {
  console.error(`\n  ${message}\n`)
  process.exit(1)
}

for (const suite of SUITES) {
  if (!existsSync(suite.path)) fail(`Suite not found: ${suite.path}`)
}

// The fixtures insert into auth.users and public.members. Pointed at a real
// project this would write junk into a live household, so only loopback is
// allowed — there is no override flag on purpose.
const host = (() => {
  try { return new URL(LOCAL_DB_URL).hostname } catch { return '' }
})()
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
  fail(`Refusing to run: ${host || LOCAL_DB_URL} is not local. This suite writes synthetic fixtures and is for a local Supabase stack only.`)
}

for (const suite of SUITES) {
  try {
    const output = execFileSync('psql', [LOCAL_DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', suite.path], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const failures = output.split('\n').filter((line) => line.includes('ASSERTION FAILED'))
    if (failures.length) fail(`${suite.name} assertions failed:\n${failures.join('\n')}`)
    console.log(`${suite.name}: all assertions passed.`)
  } catch (error) {
    if (error.code === 'ENOENT') {
      fail('psql not found on PATH. Install the PostgreSQL client, or run:\n  npx supabase db reset\n  docker exec -i supabase_db_Rodinka psql -U postgres -v ON_ERROR_STOP=1 < ' + suite.path)
    }
    const detail = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim()
    fail(`${suite.name} suite failed:\n${detail || error.message}`)
  }
}
