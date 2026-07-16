// Replaces the item matching `row.id` with the server's version — this is
// the "prefer server authority" conflict rule: no merge, the realtime
// payload always wins over local state for that one entity. If the row
// isn't present yet (a rare INSERT/UPDATE ordering race), it's appended so
// the update isn't silently lost.
export function applyRealtimeUpdate<T extends { id: string }>(items: T[], row: T): T[] {
  let found = false
  const next = items.map((item) => {
    if (item.id !== row.id) return item
    found = true
    return row
  })
  return found ? next : [...items, row]
}
