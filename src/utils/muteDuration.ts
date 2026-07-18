export type MuteDuration = 'hour' | 'tomorrow' | 'forever'

/**
 * Resolves a mute preset to the instant it lapses. `forever` returns null,
 * which the RPC stores as an indefinite mute.
 *
 * "Until tomorrow" means 08:00 local on the next day — the point where the
 * household day starts — not a rolling 24 hours, so muting the family chat
 * at 22:00 does not also silence tomorrow evening.
 */
export function muteUntil(duration: MuteDuration, now = new Date()): string | null {
  if (duration === 'forever') return null
  if (duration === 'hour') return new Date(now.getTime() + 60 * 60 * 1000).toISOString()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(8, 0, 0, 0)
  // Guard the edge case of muting between midnight and 08:00: "tomorrow"
  // must still be in the future, never a timestamp already behind us.
  if (tomorrow.getTime() <= now.getTime()) tomorrow.setDate(tomorrow.getDate() + 1)
  return tomorrow.toISOString()
}

/** True when a stored mute is still in force right now. */
export function isMuteActive(scope: string, mutedUntil: string | null, now = new Date()): boolean {
  if (scope === 'none') return false
  if (!mutedUntil) return true
  return Date.parse(mutedUntil) > now.getTime()
}
