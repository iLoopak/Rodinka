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

export const ENTRY_BUDGET = {
  rawBytes: 390_000,
  gzipBytes: 112_000,
  eagerRawBytes: 820_000,
  eagerGzipBytes: 235_000,
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
  const sizes = {
    rawBytes: entryStat.size,
    gzipBytes: gzipSync(entryBuffer).byteLength,
    eagerRawBytes: eagerBuffers.reduce((total, buffer) => total + buffer.byteLength, 0),
    eagerGzipBytes: eagerBuffers.reduce((total, buffer) => total + gzipSync(buffer).byteLength, 0),
  }
  const errors = auditRouteChunks(manifest, sizes)
  const productionFiles = [...new Set(Object.values(manifest).map((chunk) => chunk.file).filter((file) => file.endsWith('.js')))]
  const productionSources = await Promise.all(productionFiles.map((file) => readFile(path.join(projectRoot, 'dist', file), 'utf8')))
  if (productionSources.some((source) => source.includes('[Rodinka startup]'))) {
    errors.push('Development-only startup diagnostics leaked into the production bundle.')
  }

  if (errors.length) {
    console.error('Route chunk guard failed:')
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }

  console.log(`Route chunk guard passed (main file: ${sizes.rawBytes} B raw / ${sizes.gzipBytes} B gzip; eager graph: ${sizes.eagerRawBytes} B raw / ${sizes.eagerGzipBytes} B gzip).`)
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(`Route chunk guard could not run: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
