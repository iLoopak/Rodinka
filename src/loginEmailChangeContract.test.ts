import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { strings } from './strings'
import { ROUTES } from './router'

const src = new URL('.', import.meta.url).pathname
const read = (relative: string) => readFileSync(join(src, relative), 'utf8')

const moreScreen = read('components/MoreScreen.tsx')
const changeEmailForm = read('components/ChangeEmailForm.tsx')
const emailChangeLib = read('lib/emailChange.ts')
const useAuthAccount = read('hooks/useAuthAccount.ts')
const css = read('index.css')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : []
  })
}

// Changing the login email is a security-relevant action on the caller's own
// account. It must go through Supabase's confirmation flow and nothing else.
describe('login email change', () => {
  it('changes the address through the user-scoped auth API', () => {
    expect(changeEmailForm).toContain('supabase.auth.updateUser(')
    // The address is what changes, and the link comes back into the app.
    expect(changeEmailForm).toContain('{ email: validation.email }')
    expect(changeEmailForm).toContain('emailRedirectTo: getEmailChangeRedirectUrl()')
  })

  it('never uses the admin API, a service role key, or SQL against auth.users', () => {
    for (const file of sourceFiles(src)) {
      const contents = readFileSync(file, 'utf8')
      expect(contents, file).not.toContain('auth.admin')
      expect(contents, file).not.toContain('service_role')
      expect(contents, file).not.toMatch(/update\s+auth\.users/i)
      expect(contents, file).not.toMatch(/from\(['"]auth\.users['"]\)/)
    }
  })

  it('treats Supabase Auth as the only source of truth for the login email', () => {
    // Read from the auth user, and never written to a profile/member row.
    expect(useAuthAccount).toContain('supabase.auth.getUser()')
    expect(useAuthAccount).toContain('supabase.auth.onAuthStateChange')
    expect(changeEmailForm).not.toMatch(/\.from\(['"](members|profiles|family_members)['"]\)/)
    expect(moreScreen).not.toMatch(/update.*email.*members/i)
  })

  it('shows the current address, its verification state, and the change action', () => {
    expect(moreScreen).toContain('account.email || userEmail')
    expect(moreScreen).toContain('t.more.emailVerifiedBadge')
    expect(moreScreen).toContain('t.more.emailUnverifiedBadge')
    expect(moreScreen).toContain('t.more.changeEmailAction')
    expect(moreScreen).toContain('setShowChangeEmail(true)')
    expect(moreScreen).toContain('<ChangeEmailForm')
  })

  it('reports a pending change instead of showing the new address as final', () => {
    expect(moreScreen).toContain('t.more.emailPendingBadge')
    expect(moreScreen).toContain('t.more.emailPendingDetail(account.pendingEmail)')
    // Derived from Supabase's own pending-change field, not from local state.
    expect(emailChangeLib).toContain('source.new_email')
  })

  it('does not offer an email change on a managed child login', () => {
    // Child logins are synthetic identifiers, not mailboxes.
    expect(emailChangeLib).toContain('canChangeEmail: Boolean(email) && !isManagedChildLogin')
    expect(moreScreen).toContain('account.canChangeEmail && !capabilities.isChild')
  })

  it('sends the confirmation link back to a route the app actually serves', () => {
    expect(emailChangeLib).toContain('`${location.origin}/more`')
    expect(ROUTES).toContain('/more')
  })

  it('keeps inputs at the shared control size so iOS does not zoom on focus', () => {
    // The form relies on the global control sizing rather than overriding it.
    expect(css).toMatch(/input,\s*select,\s*textarea\s*\{[^}]*font-size:\s*var\(--font-size-control\)/s)
    expect(changeEmailForm).not.toMatch(/font-size/)
  })

  it('keeps a long address from pushing the account row sideways', () => {
    expect(css).toMatch(/\.account-email-status\s*\{[^}]*min-width:\s*0/s)
    expect(css).toMatch(/\.account-email-status \.more-setting-detail\s*\{[^}]*min-width:\s*0/s)
    expect(css).toMatch(/\.account-email-note\s*\{[^}]*flex:\s*1 0 100%/s)
  })

  it('lets the account row wrap so a phone shows the whole address', () => {
    // The list pins every row to nowrap at `.section-list.more-settings-list > li`
    // (specificity 0,2,1); a bare `.account-email-row` rule would lose to it and
    // the action would squeeze the address down to a few characters.
    expect(css).toMatch(/\.section-list\.more-settings-list > li\.account-email-row\s*\{[^}]*flex-wrap:\s*wrap/s)
    expect(css).toMatch(/@media \(max-width: 480px\) \{[^@]*\.account-email-row \.more-setting-copy\s*\{[^}]*flex:\s*1 1 100%/s)
  })

  it('describes the change truthfully in both languages', () => {
    for (const lang of [strings.cs, strings.en]) {
      // Never promises the address is already changed.
      expect(lang.more.changeEmailExplain).toBeTruthy()
      expect(lang.more.changeEmailSecureNote).toBeTruthy()
      // The Google note must scope the change to Rodinka's login email.
      expect(lang.more.changeEmailGoogleNote).toContain('Google')
      expect(lang.more.changeEmailSent('novy@example.com')).toContain('novy@example.com')
    }
    expect(strings.cs.more.changeEmailGoogleNote).toContain('Rodince')
    expect(strings.en.more.changeEmailGoogleNote).toContain('Rodinka')
    expect(strings.cs.more.changeEmailErrors.generic)
      .toBe('E-mail se nepodařilo změnit. Zkontrolujte zadanou adresu a zkuste to znovu.')
  })
})
