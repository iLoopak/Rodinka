import { existsSync, readFileSync } from 'node:fs'
import { dirname, extname, relative, resolve, sep } from 'node:path'

const root = process.cwd()
const entries = [
  'supabase/functions/process-reminders/index.ts',
  'supabase/functions/send-notification-deliveries/index.ts',
  'supabase/functions/manage-child-account/index.ts',
]
const forbiddenSegments = [
  `${resolve(root, 'src/hooks')}${sep}`,
  `${resolve(root, 'src/components')}${sep}`,
]
const forbiddenFiles = new Set([
  resolve(root, 'src/strings.ts'),
  resolve(root, 'src/supabaseClient.ts'),
])
const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g

function localImports(file) {
  const source = readFileSync(file, 'utf8')
  return [...source.matchAll(importPattern)]
    .map((match) => match[1] ?? match[2])
    .filter((specifier) => specifier?.startsWith('.'))
}

function inspect(entry) {
  const pending = [resolve(root, entry)]
  const visited = new Set()
  const errors = []

  while (pending.length > 0) {
    const file = pending.pop()
    if (!file || visited.has(file)) continue
    visited.add(file)

    if (!existsSync(file)) {
      errors.push(`Missing module: ${relative(root, file)}`)
      continue
    }

    if (forbiddenFiles.has(file) || forbiddenSegments.some((segment) => file.startsWith(segment))) {
      errors.push(`Browser/UI module reached from Edge graph: ${relative(root, file)}`)
    }

    for (const specifier of localImports(file)) {
      if (!extname(specifier)) {
        errors.push(`Extensionless relative import in ${relative(root, file)}: ${specifier}`)
        continue
      }
      const imported = resolve(dirname(file), specifier)
      if (!existsSync(imported)) {
        errors.push(`Unresolved import in ${relative(root, file)}: ${specifier}`)
        continue
      }
      pending.push(imported)
    }
  }

  return { entry, visited, errors }
}

const results = entries.map(inspect)
const errors = results.flatMap((result) => result.errors)

if (errors.length > 0) {
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
} else {
  for (const result of results) {
    console.log(`Edge import graph OK: ${result.entry} (${result.visited.size} local modules)`)
  }
}
