// Removes the item matching `id`. A DELETE for an id that isn't present
// locally (already removed, or never loaded) is a harmless no-op.
export function applyRealtimeDelete<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id)
}
