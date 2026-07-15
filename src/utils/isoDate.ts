// Pure YYYY-MM-DD helpers shared by the browser app and Supabase Edge
// Functions. Keep this module free of UI, localization and React imports.
export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayISODate(): string {
  return toISODate(new Date())
}

export function compareISODates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function toUTCDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function addDays(iso: string, days: number): string {
  const date = toUTCDate(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function daysBetweenISO(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((toUTCDate(b).getTime() - toUTCDate(a).getTime()) / msPerDay)
}
