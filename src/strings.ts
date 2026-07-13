// Centralized UI strings for Rodinka.
// Same pattern as the invoicing app: one place for all user-facing text,
// keyed by language, so nothing is hardcoded inline in components.

export type Lang = 'cs' | 'en'

export const strings = {
  cs: {
    appName: 'Rodinka',
    login: {
      title: 'Rodinka',
      subtitle: 'Zadejte svůj e-mail pro přihlášení — bez hesla.',
      emailPlaceholder: 'vy@example.com',
      submit: 'Odeslat přihlašovací odkaz',
      submitting: 'Odesílám...',
      checkEmailTitle: 'Zkontrolujte e-mail',
      checkEmailBody: (email: string) =>
        `Odeslali jsme přihlašovací odkaz na ${email}. Kliknutím na něj pokračujte.`,
    },
    onboarding: {
      welcomeTitle: 'Vítejte!',
      welcomeSubtitle: 'Zakládáte novou rodinu, nebo se připojujete k existující?',
      createFamilyButton: 'Založit novou rodinu',
      joinFamilyButton: 'Mám kód pozvánky',
      createTitle: 'Založte svou rodinu',
      familyNameLabel: 'Název rodiny',
      familyNamePlaceholder: 'např. Novákovi',
      yourNameLabel: 'Vaše jméno',
      yourNamePlaceholder: 'např. Lukáš',
      createSubmit: 'Založit rodinu',
      creating: 'Zakládám...',
      joinTitle: 'Připojit se k rodině',
      inviteCodeLabel: 'Kód pozvánky',
      inviteCodePlaceholder: 'např. SUNNY-42',
      joinSubmit: 'Připojit se',
      joining: 'Připojuji...',
      back: 'Zpět',
    },
    dashboard: {
      signOut: 'Odhlásit se',
      welcome: (name: string, role: string) => `Vítejte, ${name} (${role}).`,
      placeholder: 'Zde budou brzy moduly rodinného dashboardu.',
    },
    loading: {
      session: 'Načítám...',
      family: 'Načítám vaši rodinu...',
    },
  },
  en: {
    appName: 'Rodinka',
    login: {
      title: 'Rodinka',
      subtitle: 'Enter your email to sign in — no password needed.',
      emailPlaceholder: 'you@example.com',
      submit: 'Send magic link',
      submitting: 'Sending...',
      checkEmailTitle: 'Check your email',
      checkEmailBody: (email: string) =>
        `We sent a login link to ${email}. Click it to continue.`,
    },
    onboarding: {
      welcomeTitle: 'Welcome!',
      welcomeSubtitle: 'Are you starting a new family, or joining one that already exists?',
      createFamilyButton: 'Create a new family',
      joinFamilyButton: 'I have an invite code',
      createTitle: 'Create your family',
      familyNameLabel: 'Family name',
      familyNamePlaceholder: 'e.g. The Novaks',
      yourNameLabel: 'Your name',
      yourNamePlaceholder: 'e.g. Lukáš',
      createSubmit: 'Create family',
      creating: 'Creating...',
      joinTitle: 'Join a family',
      inviteCodeLabel: 'Invite code',
      inviteCodePlaceholder: 'e.g. SUNNY-42',
      joinSubmit: 'Join family',
      joining: 'Joining...',
      back: 'Back',
    },
    dashboard: {
      signOut: 'Sign out',
      welcome: (name: string, role: string) => `Welcome, ${name} (${role}).`,
      placeholder: 'Family dashboard modules go here next.',
    },
    loading: {
      session: 'Loading...',
      family: 'Loading your family...',
    },
  },
} as const

// Phase 0: hardcode to Czech-first. Phase 1+ can wire this up to a real
// language switcher (e.g. stored per-user, or browser locale detection).
export const currentLang: Lang = 'cs'
export const t = strings[currentLang]
