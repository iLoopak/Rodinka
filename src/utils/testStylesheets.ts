import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Wave 7 split one stylesheet into tokens, base, the main sheet and two route
// sheets. Contract tests care about the rules the browser ends up with, not
// which file holds them, so they read a concatenation in cascade order rather
// than a single path that no longer holds everything.

const GLOBAL = [
  'src/styles/tokens.css',
  'src/styles/base.css',
  'src/index.css',
] as const

const ROUTE = [
  'src/components/messages/messages.css',
  'src/features/family-jump/familyJump.css',
] as const

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

/** The sheets loaded on every screen: tokens, element defaults, main. */
export function globalStyles(): string {
  return GLOBAL.map(read).join('\n')
}

/**
 * Everything `src/index.css` contained before the Wave 7 split — the global
 * sheets plus the chat rules that moved to the Messages route chunk.
 *
 * Family Jump is deliberately excluded: `familyJump.css` was always a separate
 * file and has never been inside the design-system contracts. Widening them to
 * cover it surfaces unrelated pre-existing debt, which is its own piece of
 * work rather than a side effect of moving files around.
 */
export function appStyles(): string {
  return [...GLOBAL, 'src/components/messages/messages.css'].map(read).join('\n')
}

/** Every rule the app ships, route sheets included. */
export function allStyles(): string {
  return [...GLOBAL, ...ROUTE].map(read).join('\n')
}
