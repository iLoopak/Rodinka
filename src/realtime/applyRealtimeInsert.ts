// Appends a realtime-inserted row into an existing array, keyed by `id`.
// Idempotent by design: a row that's already present (e.g. because the
// local mutation that created it already refreshed its own domain, and
// this is the server's realtime echo of that same change arriving after
// the fact) is a no-op rather than a duplicate — this is the dedup the
// optimistic-updates requirement asks for, without needing a separate
// clientMutationId for domains that don't already have one.
export function applyRealtimeInsert<T extends { id: string }>(items: T[], row: T): T[] {
  if (items.some((item) => item.id === row.id)) return items
  return [...items, row]
}
