// Mention parsing shared by the composer autocomplete and the bubble
// renderer.
//
// The matching rule is deliberately the same one `resolve_message_mentions`
// applies in SQL: a member is mentioned when the body contains
// "@<display name>", case-insensitively. Keeping one rule on both sides
// means what the user sees highlighted is exactly who gets notified — no
// message where the text looks like a mention but no push went out, and
// none where someone is pinged without their name being visible.

export interface MentionCandidate {
  id: string
  name: string
}

export interface MentionSpan {
  start: number
  end: number
  member: MentionCandidate
}

export interface MentionQuery {
  /** Index of the '@' that opened the query. */
  start: number
  /** Text typed after the '@', may be empty right after typing '@'. */
  query: string
}

// A mention query is only open when the '@' starts a word (beginning of the
// text or after whitespace). That keeps e-mail addresses from turning the
// autocomplete on mid-typing.
const MENTION_OPENER = /(^|\s)@([^\n@]*)$/

/**
 * Detects an in-progress "@..." at the caret. Returns null when the caret is
 * not inside a mention token.
 */
export function findMentionQuery(text: string, caret: number): MentionQuery | null {
  const before = text.slice(0, caret)
  const match = MENTION_OPENER.exec(before)
  if (!match) return null
  const query = match[2]
  // Once the typed run is longer than any plausible name, stop offering.
  if (query.length > 40) return null
  return { start: caret - query.length - 1, query }
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase('cs')
}

/**
 * Candidates whose name starts with the typed run, then those that merely
 * contain it. An empty query lists everyone.
 */
export function matchMentionCandidates(
  candidates: readonly MentionCandidate[],
  query: string,
  limit = 6,
): MentionCandidate[] {
  const needle = normalize(query)
  const usable = candidates.filter((candidate) => candidate.name.trim() !== '')
  if (!needle) return usable.slice(0, limit)
  const starts: MentionCandidate[] = []
  const contains: MentionCandidate[] = []
  for (const candidate of usable) {
    const name = normalize(candidate.name)
    if (name.startsWith(needle)) starts.push(candidate)
    else if (name.includes(needle)) contains.push(candidate)
  }
  return [...starts, ...contains].slice(0, limit)
}

/**
 * Replaces the in-progress "@..." with the full "@Name " and reports where
 * the caret should land.
 */
export function applyMention(
  text: string,
  mention: MentionQuery,
  caret: number,
  member: MentionCandidate,
): { text: string; caret: number } {
  const inserted = `@${member.name.trim()} `
  const next = text.slice(0, mention.start) + inserted + text.slice(caret)
  return { text: next, caret: mention.start + inserted.length }
}

/**
 * Every "@Name" occurrence in a finished message body. Longer names win at
 * a given position, so "@Anna Marie" is one span rather than a match on
 * "@Anna" followed by stray text.
 */
export function findMentionSpans(
  body: string,
  candidates: readonly MentionCandidate[],
): MentionSpan[] {
  if (!body) return []
  const haystack = body.toLocaleLowerCase('cs')
  const ordered = [...candidates]
    .filter((candidate) => candidate.name.trim() !== '')
    .sort((a, b) => b.name.trim().length - a.name.trim().length)

  const spans: MentionSpan[] = []
  const taken: boolean[] = new Array(body.length).fill(false)

  for (const member of ordered) {
    const token = `@${member.name.trim()}`.toLocaleLowerCase('cs')
    let from = 0
    for (;;) {
      const index = haystack.indexOf(token, from)
      if (index === -1) break
      const end = index + token.length
      // Skip if this range overlaps a longer mention already claimed.
      let overlaps = false
      for (let i = index; i < end; i += 1) if (taken[i]) { overlaps = true; break }
      if (!overlaps) {
        for (let i = index; i < end; i += 1) taken[i] = true
        spans.push({ start: index, end, member })
      }
      from = index + 1
    }
  }

  return spans.sort((a, b) => a.start - b.start)
}

/** Member ids mentioned in a body — what the composer sends to the RPC. */
export function mentionedMemberIds(
  body: string,
  candidates: readonly MentionCandidate[],
): string[] {
  return [...new Set(findMentionSpans(body, candidates).map((span) => span.member.id))]
}

export interface MentionTextSegment {
  text: string
  member: MentionCandidate | null
}

/** Splits a body into plain and mention segments for rendering. */
export function splitMentionText(
  body: string,
  candidates: readonly MentionCandidate[],
): MentionTextSegment[] {
  const spans = findMentionSpans(body, candidates)
  if (spans.length === 0) return [{ text: body, member: null }]
  const segments: MentionTextSegment[] = []
  let cursor = 0
  for (const span of spans) {
    if (span.start > cursor) segments.push({ text: body.slice(cursor, span.start), member: null })
    segments.push({ text: body.slice(span.start, span.end), member: span.member })
    cursor = span.end
  }
  if (cursor < body.length) segments.push({ text: body.slice(cursor), member: null })
  return segments
}
