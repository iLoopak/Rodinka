import type { Route } from '../router'

export type QueryHistoryMode = 'push' | 'replace'
export type DeepLinkResolution<T> =
  | { status: 'none' }
  | { status: 'invalid' }
  | { status: 'not_found' }
  | { status: 'found'; item: T }

export type ShareResult = 'shared' | 'copied' | 'cancelled'

interface ShareNavigator {
  share?: (data: ShareData) => Promise<void>
  clipboard?: { writeText: (text: string) => Promise<void> }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function queryParam(search: string, name: string): string | null {
  return new URLSearchParams(search).get(name)
}

export function updateQueryParam(search: string, name: string, value: string | null): string {
  const params = new URLSearchParams(search)
  if (value === null) params.delete(name)
  else params.set(name, value)
  const next = params.toString()
  return next ? `?${next}` : ''
}

export function updateUrlQuery(href: string, name: string, value: string | null): string {
  const url = new URL(href)
  url.search = updateQueryParam(url.search, name, value)
  return `${url.pathname}${url.search}${url.hash}`
}

export function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

export function isValidISODate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

export function resolveDeepLinkedItem<T extends { id: string }>(
  items: readonly T[],
  rawId: string | null
): DeepLinkResolution<T> {
  if (rawId === null) return { status: 'none' }
  if (!isValidUuid(rawId)) return { status: 'invalid' }
  const item = items.find((candidate) => candidate.id === rawId)
  return item ? { status: 'found', item } : { status: 'not_found' }
}

export function buildDeepLink(origin: string, route: Route, param: string, id: string): string {
  const url = new URL(route, origin)
  url.searchParams.set(param, id)
  return url.toString()
}

export async function shareDeepLink(
  url: string,
  title: string,
  navigatorApi: ShareNavigator = navigator
): Promise<ShareResult> {
  if (navigatorApi.share) {
    try {
      await navigatorApi.share({ title, url })
      return 'shared'
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled'
    }
  }
  if (!navigatorApi.clipboard) throw new Error('Clipboard is not available')
  await navigatorApi.clipboard.writeText(url)
  return 'copied'
}
