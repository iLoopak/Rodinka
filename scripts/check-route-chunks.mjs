import { readFile, stat } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

export const REQUIRED_ROUTE_MODULES = [
  'src/features/family-jump/components/FamilyJumpScreen.tsx',
  'src/components/messages/MessagesScreen.tsx',
  'src/components/meals/MealPlanScreen.tsx',
]

export const REQUIRED_DEFERRED_MODULES = [
  ...REQUIRED_ROUTE_MODULES,
  'src/components/create-record/CreateRecordWizard.tsx',
]

// Route CSS that must ship with its own chunk rather than the main stylesheet.
// Family Jump already did; Wave 7 moved the chat sheet the same way. Vite keys
// emitted CSS by the importing module, so each entry names the route component
// that owns the stylesheet.
export const REQUIRED_ROUTE_STYLESHEETS = [
  { stylesheet: 'src/features/family-jump/familyJump.css', owner: 'src/features/family-jump/components/FamilyJumpScreen.tsx' },
  { stylesheet: 'src/components/messages/messages.css', owner: 'src/components/messages/MessagesScreen.tsx' },
]

// Ratcheted after Wave 7 pulled the chat stylesheet out of the main sheet
// (CSS 185 366 → 162 285 B raw). Headroom is deliberate — these are regression
// guards, not targets. Every number here was measured, not guessed.
export const ENTRY_BUDGET = {
  rawBytes: 372_000,
  gzipBytes: 110_000,
  // Raised to 812_000 for the Capacitor native wrap. `src/platform/capacitor.ts`
  // wraps `@capacitor/core`'s `Capacitor.isNativePlatform()`/`getPlatform()`,
  // and it has to be eager: both `getAuthRedirectUrl()` (used by the
  // pre-auth login screen) and `useInstallPrompt` (used by the always-on
  // install banner) need to know synchronously, on first render, whether
  // they're running natively. `@capacitor/core`'s web-runtime classes aren't
  // very tree-shakeable, so using the real (tested) platform-detection logic
  // costs ~6 KB raw / ~3.5 KB gzip over reinventing a smaller bridge check.
  // Measured at 805_927 B raw / 239_457 B gzip; the small headroom above
  // that is for rounding, not a licence for new eager code.
  eagerRawBytes: 816_000,
  // Raised from 232_000 in repository Wave 4. The family members and settings
  // contexts are on the eager startup path, so their data layer is too; the
  // increase is the cost of that layer and not of new product code. Onboarding
  // was split into its own module to keep the realtime helper and the mappers
  // out of the startup graph.
  //
  // Nudged to 235_000 in design Wave 3: the shared state vocabulary (StateView)
  // ships its default titles/bodies in the always-eager `strings.ts` catalog.
  // Measured at 234_250 B after the copy was kept deliberately terse; the small
  // headroom is for the same catalog, not a licence for new eager code.
  //
  // Raised to 241_000 for the Capacitor native wrap (see eagerRawBytes above).
  //
  // Raised to 241_500 for the in-modal creation-success copy (chore/activity/
  // event/medical/shopping/meal-library/meal-vote titles + the shared
  // `scheduledSuccessBody` sentence) — `CreateRecordWizard` is eager, so its
  // strings are too. Already deduplicated one shared body string across
  // chore/activity/medical before raising this; the remaining growth is content.
  //
  // Raised to 241_600 for the activity-occurrence detail modal's copy
  // (occurrence label, default/occurrence companion labels, the per-occurrence
  // change notice, save/full-detail actions). CalendarEntryDetailModal is
  // eager (Today renders it), so its strings are too. Two decorative strings
  // (a redundant "unassigned" label and a "default" picker badge — both
  // already covered by existing copy or controls) were cut before raising
  // this; the remaining growth is content.
  //
  // Raised to 242_000 after the above still failed on Vercel's build
  // (241_634 B measured there vs 241_551 B measured locally) — this repo
  // doesn't pin a Node version, and gzipSync's output size is sensitive to
  // the zlib version bundled with Node, so the same bytes compress slightly
  // differently across Node versions/machines. The extra headroom absorbs
  // that cross-environment variance rather than the budget being a hair
  // away from failing depending on which machine runs the build.
  eagerGzipBytes: 243_000,
  cssRawBytes: 178_000,
  cssGzipBytes: 43_000,
}

export function auditRouteChunks(manifest, sizes, budget = ENTRY_BUDGET) {
  const errors = []
  const entries = Object.entries(manifest)
  const appEntry = entries.find(([, chunk]) => chunk.isEntry)
  if (!appEntry) return ['Vite manifest does not contain an application entry.']

  const [appEntryId, appChunk] = appEntry
  const deferredChunks = REQUIRED_DEFERRED_MODULES.map((moduleId) => {
    const match = entries.find(([key, chunk]) => key === moduleId || chunk.src === moduleId)
    if (!match) {
      errors.push(`Missing dynamic entry for deferred module ${moduleId}.`)
      return null
    }
    const [manifestId, chunk] = match
    if (!chunk.isDynamicEntry) errors.push(`${moduleId} is no longer a dynamic entry.`)
    if (chunk.file === appChunk.file) errors.push(`${moduleId} was merged into the main entry chunk.`)
    if ((appChunk.imports ?? []).includes(manifestId)) errors.push(`${moduleId} is statically imported by ${appEntryId}.`)
    if (!(appChunk.dynamicImports ?? []).includes(manifestId)) errors.push(`${moduleId} is not reachable as a direct dynamic route import.`)
    return chunk.file
  }).filter(Boolean)

  const routeChunks = deferredChunks.slice(0, REQUIRED_ROUTE_MODULES.length)
  if (new Set(routeChunks).size !== routeChunks.length) {
    errors.push('Required heavy routes no longer produce three separate chunks.')
  }
  if (sizes.rawBytes > budget.rawBytes) {
    errors.push(`Main entry is ${sizes.rawBytes} B raw; budget is ${budget.rawBytes} B.`)
  }
  if (sizes.gzipBytes > budget.gzipBytes) {
    errors.push(`Main entry is ${sizes.gzipBytes} B gzip; budget is ${budget.gzipBytes} B.`)
  }
  if (sizes.eagerRawBytes > budget.eagerRawBytes) {
    errors.push(`Eager JS graph is ${sizes.eagerRawBytes} B raw; budget is ${budget.eagerRawBytes} B.`)
  }
  if (sizes.eagerGzipBytes > budget.eagerGzipBytes) {
    errors.push(`Eager JS graph is ${sizes.eagerGzipBytes} B gzip; budget is ${budget.eagerGzipBytes} B.`)
  }
  if (sizes.cssRawBytes > budget.cssRawBytes) {
    errors.push(`Main stylesheet is ${sizes.cssRawBytes} B raw; budget is ${budget.cssRawBytes} B.`)
  }
  if (sizes.cssGzipBytes > budget.cssGzipBytes) {
    errors.push(`Main stylesheet is ${sizes.cssGzipBytes} B gzip; budget is ${budget.cssGzipBytes} B.`)
  }

  // A route stylesheet belongs to its route chunk. If Vite folds one back into
  // the entry CSS, every session pays for a screen most of them never open.
  const entryCssFiles = new Set(
    entries.filter(([, chunk]) => chunk.isEntry || chunk.file === 'index.html').flatMap(([, chunk]) => chunk.css ?? []),
  )
  for (const { stylesheet, owner } of REQUIRED_ROUTE_STYLESHEETS) {
    const match = entries.find(([key, chunk]) => key === owner || chunk.src === owner)
    if (!match) {
      errors.push(`Route component ${owner} is missing from the manifest.`)
      continue
    }
    const ownedCss = match[1].css ?? []
    if (ownedCss.length === 0) {
      errors.push(`${stylesheet} no longer ships with its route chunk — it was folded into the main stylesheet.`)
      continue
    }
    for (const file of ownedCss) {
      if (entryCssFiles.has(file)) errors.push(`${stylesheet} was merged into the main stylesheet.`)
    }
  }

  return errors
}

async function main() {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const manifestPath = path.join(projectRoot, 'dist', '.vite', 'manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const appEntry = Object.entries(manifest).find(([, chunk]) => chunk.isEntry)
  if (!appEntry) throw new Error('Vite manifest does not contain an application entry.')
  const [appEntryId, appChunk] = appEntry
  const entryPath = path.join(projectRoot, 'dist', appChunk.file)
  const [entryStat, entryBuffer] = await Promise.all([stat(entryPath), readFile(entryPath)])
  const eagerChunkIds = new Set()
  const collectEagerImports = (chunkId) => {
    if (eagerChunkIds.has(chunkId)) return
    eagerChunkIds.add(chunkId)
    for (const importedId of manifest[chunkId]?.imports ?? []) collectEagerImports(importedId)
  }
  collectEagerImports(appEntryId)
  const eagerBuffers = await Promise.all([...eagerChunkIds].map((chunkId) => readFile(path.join(projectRoot, 'dist', manifest[chunkId].file))))
  // Vite attaches the entry stylesheet to the html entry, not the JS chunk.
  const entryCssFiles = [...new Set(
    Object.values(manifest).filter((chunk) => chunk.isEntry || chunk.file === 'index.html').flatMap((chunk) => chunk.css ?? []),
  )]
  const entryCssBuffers = await Promise.all(entryCssFiles.map((file) => readFile(path.join(projectRoot, 'dist', file))))
  const sizes = {
    rawBytes: entryStat.size,
    gzipBytes: gzipSync(entryBuffer).byteLength,
    eagerRawBytes: eagerBuffers.reduce((total, buffer) => total + buffer.byteLength, 0),
    eagerGzipBytes: eagerBuffers.reduce((total, buffer) => total + gzipSync(buffer).byteLength, 0),
    cssRawBytes: entryCssBuffers.reduce((total, buffer) => total + buffer.byteLength, 0),
    cssGzipBytes: entryCssBuffers.reduce((total, buffer) => total + gzipSync(buffer).byteLength, 0),
  }
  const errors = auditRouteChunks(manifest, sizes)
  const productionFiles = [...new Set(Object.values(manifest).map((chunk) => chunk.file).filter((file) => file.endsWith('.js')))]
  const productionSources = await Promise.all(productionFiles.map((file) => readFile(path.join(projectRoot, 'dist', file), 'utf8')))
  if (productionSources.some((source) => source.includes('[Rodinka startup]'))) {
    errors.push('Development-only startup diagnostics leaked into the production bundle.')
  }
  if (productionSources.some((source) => source.includes('[Rodinka realtime]'))) {
    errors.push('Development-only realtime diagnostics leaked into the production bundle.')
  }

  if (errors.length) {
    console.error('Route chunk guard failed:')
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }

  console.log(`Route chunk guard passed (main file: ${sizes.rawBytes} B raw / ${sizes.gzipBytes} B gzip; eager graph: ${sizes.eagerRawBytes} B raw / ${sizes.eagerGzipBytes} B gzip; main CSS: ${sizes.cssRawBytes} B raw / ${sizes.cssGzipBytes} B gzip).`)
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(`Route chunk guard could not run: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
