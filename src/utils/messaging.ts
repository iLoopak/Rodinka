import { getCurrentLanguage } from '../i18n'
import { toUTCDate } from './isoDate'

// Group consecutive messages by (sender, minute-ish window) so a burst of
// short replies from one member reads as a single visual cluster rather
// than a wall of author avatars. `windowMs` is the maximum gap between two
// messages that still counts as the same cluster.
export interface MessageClusterInput {
  id: string
  senderId: string | null
  createdAt: string
}

export interface MessageCluster<T extends MessageClusterInput> {
  senderId: string | null
  startAt: string
  endAt: string
  messages: T[]
}

const DEFAULT_CLUSTER_GAP_MS = 5 * 60 * 1000

export function clusterMessages<T extends MessageClusterInput>(messages: T[], windowMs = DEFAULT_CLUSTER_GAP_MS): MessageCluster<T>[] {
  const clusters: MessageCluster<T>[] = []
  for (const message of messages) {
    const last = clusters[clusters.length - 1]
    const timestamp = Date.parse(message.createdAt)
    if (
      last
      && last.senderId === message.senderId
      && Number.isFinite(timestamp)
      && timestamp - Date.parse(last.endAt) <= windowMs
    ) {
      last.messages.push(message)
      last.endAt = message.createdAt
    } else {
      clusters.push({ senderId: message.senderId, startAt: message.createdAt, endAt: message.createdAt, messages: [message] })
    }
  }
  return clusters
}

function locale() {
  return getCurrentLanguage() === 'cs' ? 'cs-CZ' : 'en-US'
}

export function formatMessageTime(iso: string): string {
  const asDate = new Date(iso)
  if (Number.isNaN(asDate.getTime())) return ''
  return asDate.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
}

// "13:24" for today, "wed 13:24" this week, "12 Sep" earlier this year,
// "12 Sep 2024" further back. Anchored on the viewer's local time (a
// message sent at 23:59 in the viewer's timezone is "today" until midnight
// there, regardless of when the DB row happens to say UTC-midnight).
export function formatConversationTimestamp(iso: string, now: Date = new Date()): string {
  const asDate = new Date(iso)
  if (Number.isNaN(asDate.getTime())) return ''
  const sameDay = asDate.toDateString() === now.toDateString()
  if (sameDay) return asDate.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
  const diffMs = now.getTime() - asDate.getTime()
  const oneWeek = 6 * 24 * 60 * 60 * 1000
  if (diffMs > 0 && diffMs < oneWeek) {
    return asDate.toLocaleDateString(locale(), { weekday: 'short' })
  }
  const sameYear = asDate.getFullYear() === now.getFullYear()
  return asDate.toLocaleDateString(locale(), sameYear
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' })
}

// Slightly friendlier day divider inside the conversation itself — "Today",
// "Yesterday", or the local date.
export function formatDayDivider(iso: string, now: Date = new Date(), t: { today: string; yesterday: string }): string {
  const asDate = new Date(iso)
  if (Number.isNaN(asDate.getTime())) return ''
  const asDay = new Date(asDate.getFullYear(), asDate.getMonth(), asDate.getDate())
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (asDay.getTime() === today.getTime()) return t.today
  if (asDay.getTime() === yesterday.getTime()) return t.yesterday
  return asDate.toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: asDate.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
}

export function messageDayKey(iso: string): string {
  const asDate = new Date(iso)
  if (Number.isNaN(asDate.getTime())) return ''
  return `${asDate.getFullYear()}-${String(asDate.getMonth() + 1).padStart(2, '0')}-${String(asDate.getDate()).padStart(2, '0')}`
}

export { toUTCDate }
