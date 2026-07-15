export function moveIdBefore(ids: string[], movedId: string, targetId: string): string[] {
  if (movedId === targetId || !ids.includes(movedId) || !ids.includes(targetId)) return ids
  const next = ids.filter((id) => id !== movedId)
  next.splice(next.indexOf(targetId), 0, movedId)
  return next
}

export function moveIdToEnd(ids: string[], movedId: string): string[] {
  if (!ids.includes(movedId)) return [...ids, movedId]
  return [...ids.filter((id) => id !== movedId), movedId]
}

export function insertIdBefore(ids: string[], movedId: string, targetId: string | null): string[] {
  const next = ids.filter((id) => id !== movedId)
  if (!targetId || !next.includes(targetId)) return [...next, movedId]
  next.splice(next.indexOf(targetId), 0, movedId)
  return next
}
