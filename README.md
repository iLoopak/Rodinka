# Rodinka

**Ať doma všechno klape. · Helping family life run smoothly.**

Rodinka je mobilní rodinný organizér, který spojuje kalendář, úkoly, aktivity, zdraví, jídla, nákupy, připomínky, zprávy a krátké rodinné hry.

*Rodinka is a mobile-first family organizer that brings calendars, chores, activities, health appointments, meals, shopping, reminders, messages, and quick family games into one shared home.*

[**Zjistit více · Visit the landing page**](https://rodinka-web.vercel.app/) · [**Otevřít aplikaci · Open the app**](http://moje-rodinka.vercel.app/)

[Česky](#česky) · [English](#english) · [For developers](#for-developers)

> Rodinka je v aktivním vývoji. · Rodinka is under active development. The hosted app is intended for testing and early use; running a production instance requires a Supabase project and the service configuration described below.

## Česky

### Jedno klidné místo pro celou domácnost

Rodinka pomáhá rodině sdílet každodenní plán bez hledání v několika chatech, poznámkách a kalendářích. Každý člen má vlastní profil a barvu, dospělí mohou spravovat domácnost a děti dostanou jednoduchý pohled na své úkoly, odměny a rodinné hry.

### Co Rodinka umí

- **Dnes:** aktuální program, úkoly a důležité připomínky v jednom rychlém přehledu.
- **Rodinný kalendář:** měsíční, týdenní a agenda pohled; opakované události, filtry a jednorázové změny doprovodu nebo řešitele.
- **Úkoly a kapesné:** jednorázové i opakované povinnosti, rychlé úkoly, dětské odměny, schvalování dospělým a historie splnění.
- **Aktivity a zdraví:** kroužky, rodinné akce, návštěvy lékaře, očkování, kontakty, platby a připomínky.
- **Jídla:** knihovna oblíbených jídel, týdenní plán, rodinné hlasování a přidání surovin do nákupního seznamu.
- **Sdílený nákup:** rychlé přidávání, kategorie, řazení, historie a synchronizace změn; rozpracovaný seznam funguje i při výpadku připojení.
- **Zprávy:** společný rodinný chat, přímé konverzace, reakce, přílohy, sdílení položek z Rodinky a živé počty nepřečtených zpráv.
- **Připomínky:** jedno centrum pro úkoly, aktivity, zdraví, kapesné a nákupy, včetně osobního nastavení, tichých hodin a Web Push.
- **Rodinná herna:** krátké hry **Rodinka Jump** a **Rodinná flotila**, osobní i rodinné rekordy, odemykatelné doplňky, achievementy a hraní offline.
- **Profily a přístup:** pozvánky pro další dospělé, spravované dětské účty, role, vlastní barvy, profilové fotografie a rodinná fotografie.

### Navržená pro telefony i skutečný provoz

Rodinka je responzivní Progressive Web App, kterou lze otevřít v prohlížeči nebo přidat na plochu telefonu. Rozhraní je dostupné česky i anglicky. Vybrané obrazovky — Dnes, kalendář, nákup a rodinné hry — zůstávají použitelné offline a změny se po návratu připojení bezpečně synchronizují.

Data jednotlivých domácností odděluje Supabase Row Level Security. Fotografie jsou uložené v privátních úložištích a zpřístupňují se pomocí dočasných podepsaných adres. Role člena určují, kdo může měnit rodinu, schvalovat odměny nebo spravovat dětské účty.

Zdravotní část slouží k rodinnému plánování termínů a návštěv, ne k vedení klinické dokumentace.

---

## English

### One calm place for the whole household

Rodinka keeps the family's everyday plan out of scattered chats, notes, and calendars. Every family member has their own profile and color. Adults can manage the household, while children get a focused view of their chores, rewards, and family games.

### What Rodinka can do

- **Today:** the current schedule, chores, and important reminders in one glanceable dashboard.
- **Family calendar:** month, week, and agenda views with recurrence, filters, and one-off assignee or chaperone changes.
- **Chores and allowance:** one-time and recurring chores, quick tasks, child rewards, adult approval, and completion history.
- **Activities and health:** clubs, family events, appointments, vaccinations, contacts, payments, and reminders.
- **Meals:** a shared meal library, weekly planning, family voting, and one-tap ingredient transfer to shopping.
- **Shared shopping:** fast entry, categories, ordering, history, and live synchronization, backed by a durable offline queue.
- **Messages:** a household chat, direct conversations, reactions, attachments, shared Rodinka items, and live unread counts.
- **Reminders:** one notification center for chores, activities, health, allowance, and shopping, with personal preferences, quiet hours, and Web Push.
- **Family Arcade:** quick **Rodinka Jump** and **Family Fleet** games with personal and family records, unlockable cosmetics, achievements, and offline play.
- **Profiles and access:** adult invitations, managed child accounts, roles, custom colors, profile photos, and a family cover photo.

### Built for phones and real-world connectivity

Rodinka is a responsive Progressive Web App that works in a browser and can be installed on a phone's home screen. The interface is available in Czech and English. Selected experiences — Today, Calendar, Shopping, and the family games — remain useful offline and reconcile safely after the connection returns.

Supabase Row Level Security isolates each household's data. Photos live in private storage and are served through temporary signed URLs. Member roles control family administration, reward approval, and managed child accounts.

---

## For developers

### Stack

- React 19, TypeScript, and Vite 8
- Supabase PostgreSQL, Auth, Storage, Realtime, Edge Functions, and Row Level Security
- Vitest and Testing Library
- i18next with Czech and English translations
- IndexedDB-backed offline repositories and durable mutation queues
- Vercel deployment as an installable PWA
- Capacitor 8 native wrap for iOS and Android (scaffolded; store release needs the owner's own signing/push credentials — see below)

### Run locally

You will need Node.js with npm and a Supabase project.

```bash
npm install
cp .env.example .env
```

Fill in the public client configuration:

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_VAPID_PUBLIC_KEY=
```

`VITE_VAPID_PUBLIC_KEY` is optional unless you are testing Web Push. Start the app at `http://localhost:5173`:

```bash
npm run dev
```

Database changes are versioned in [`supabase/migrations`](./supabase/migrations). After linking the Supabase CLI to your project, review pending migrations before applying them:

```bash
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
```

### Quality checks

```bash
npm run lint
npm test
npm run build
```

Additional repository and backend checks are available through `npm run check:data-access`, `npm run check:edge-functions`, and `npm run test:db`.

### Project map

```text
src/components/       Screens and shared interface components
src/features/         Feature-specific domain, data, UI, and game code
src/context/          React providers and application-facing state
src/repositories/     Persistence and synchronization boundaries
src/shopping/         Offline-first shopping repository and mutation queue
src/calendar/         Offline calendar snapshot, queue, and synchronization
src/notifications/    Reminder generation and delivery rules
src/i18n/             Czech and English localization
src/styles/           Design tokens and shared UI primitives
supabase/migrations/  Database schema, policies, and transactional RPCs
supabase/functions/   Reminder, notification, and child-account Edge Functions
```

The general data flow is:

```text
screen → feature context/hook → repository → local cache / Supabase / Realtime
```

Repositories own persistence, mapping, offline queues, and synchronization. Contexts own React state and presentation-facing orchestration. Pure business rules stay in domain utilities. Routes and heavier features are loaded lazily, and bundle budgets are checked during production builds.

### Useful documentation

- [Repository architecture](./docs/REPOSITORY_ARCHITECTURE.md)
- [Offline shopping](./docs/OFFLINE_SHOPPING.md)
- [Offline calendar](./docs/offline-calendar.md)
- [Internationalization guide](./I18N.md)
- [Web Push setup](./supabase-web-push.md)
- [Messaging Push setup](./supabase-messaging-push.md)
- [Child account setup](./supabase-child-accounts.md)
- [Capacitor native app setup](./docs/CAPACITOR_NATIVE_SETUP.md)
- [Native release checklist](./docs/NATIVE_RELEASE_CHECKLIST.md)
- [Product roadmap](./rodinka-roadmap.md)

### Deployment

The frontend is configured for Vercel, including single-page application rewrites. A complete deployment also needs a configured Supabase project, applied migrations, authentication providers, Storage buckets, Edge Functions, reminder scheduling, Web Push keys, and appropriate backup/monitoring policies.

- **Product site:** [rodinka-web.vercel.app](https://rodinka-web.vercel.app/)
- **Hosted app:** [moje-rodinka.vercel.app](http://moje-rodinka.vercel.app/)
