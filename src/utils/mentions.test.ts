import { describe, expect, it } from 'vitest'
import {
  applyMention,
  findMentionQuery,
  findMentionSpans,
  matchMentionCandidates,
  mentionedMemberIds,
  splitMentionText,
} from './mentions'

const PETRA = { id: 'p', name: 'Petra' }
const PAVEL = { id: 'a', name: 'Pavel' }
const ANNA_MARIE = { id: 'am', name: 'Anna Marie' }
const ANNA = { id: 'an', name: 'Anna' }
const FAMILY = [PETRA, PAVEL, ANNA_MARIE, ANNA]

describe('findMentionQuery', () => {
  it('opens on "@" at the start of a word', () => {
    expect(findMentionQuery('@pe', 3)).toEqual({ start: 0, query: 'pe' })
    expect(findMentionQuery('ahoj @pe', 8)).toEqual({ start: 5, query: 'pe' })
  })

  it('opens with an empty query immediately after "@"', () => {
    expect(findMentionQuery('ahoj @', 6)).toEqual({ start: 5, query: '' })
  })

  it('does not open mid-word, so e-mail addresses are left alone', () => {
    expect(findMentionQuery('petra@example.com', 17)).toBeNull()
  })

  it('closes once the caret leaves the token', () => {
    // Caret sits before the "@", so nothing is being typed into a mention.
    expect(findMentionQuery('ahoj @petra', 4)).toBeNull()
  })

  it('closes across a newline', () => {
    expect(findMentionQuery('@petra\nahoj', 11)).toBeNull()
  })

  it('gives up on an implausibly long run', () => {
    expect(findMentionQuery(`@${'x'.repeat(41)}`, 42)).toBeNull()
  })
})

describe('matchMentionCandidates', () => {
  it('lists everyone for an empty query', () => {
    expect(matchMentionCandidates(FAMILY, '')).toHaveLength(4)
  })

  it('puts prefix matches ahead of substring matches', () => {
    const result = matchMentionCandidates([{ id: 'x', name: 'Marie' }, PETRA, ANNA_MARIE], 'mar')
    expect(result[0].name).toBe('Marie')
    expect(result.map((c) => c.id)).toContain('am')
    expect(result.map((c) => c.id)).not.toContain('p')
  })

  it('is case- and diacritics-position insensitive on the prefix', () => {
    expect(matchMentionCandidates(FAMILY, 'PET')[0]).toEqual(PETRA)
  })
})

describe('applyMention', () => {
  it('replaces the partial token and reports the caret after the space', () => {
    const query = findMentionQuery('ahoj @pe', 8)!
    const result = applyMention('ahoj @pe', query, 8, PETRA)
    expect(result.text).toBe('ahoj @Petra ')
    expect(result.caret).toBe(12)
  })

  it('keeps text that follows the caret', () => {
    const query = findMentionQuery('ahoj @pe', 8)!
    const result = applyMention('ahoj @pe, jak se máš', query, 8, PETRA)
    expect(result.text).toBe('ahoj @Petra , jak se máš')
  })
})

describe('findMentionSpans', () => {
  it('finds a simple mention', () => {
    const spans = findMentionSpans('ahoj @Petra', FAMILY)
    expect(spans).toHaveLength(1)
    expect(spans[0].member).toEqual(PETRA)
  })

  it('prefers the longest name so a two-word name is not split', () => {
    const spans = findMentionSpans('@Anna Marie ahoj', FAMILY)
    expect(spans).toHaveLength(1)
    expect(spans[0].member).toEqual(ANNA_MARIE)
    expect(spans[0].end).toBe('@Anna Marie'.length)
  })

  it('still matches the shorter name when the longer one is not present', () => {
    const spans = findMentionSpans('@Anna ahoj', FAMILY)
    expect(spans).toHaveLength(1)
    expect(spans[0].member).toEqual(ANNA)
  })

  it('matches case-insensitively, mirroring the SQL rule', () => {
    expect(findMentionSpans('ahoj @petra', FAMILY)[0].member).toEqual(PETRA)
  })

  it('finds several distinct mentions in order', () => {
    const spans = findMentionSpans('@Petra a @Pavel', FAMILY)
    expect(spans.map((s) => s.member.id)).toEqual(['p', 'a'])
  })

  it('returns nothing without an "@"', () => {
    expect(findMentionSpans('Petra a Pavel', FAMILY)).toEqual([])
  })
})

describe('mentionedMemberIds', () => {
  it('de-duplicates a member mentioned twice', () => {
    expect(mentionedMemberIds('@Petra @Petra', FAMILY)).toEqual(['p'])
  })

  it('is empty for a body with no mentions', () => {
    expect(mentionedMemberIds('nic tu není', FAMILY)).toEqual([])
  })
})

describe('splitMentionText', () => {
  it('splits into plain and mention segments covering the whole body', () => {
    const segments = splitMentionText('ahoj @Petra, jak se máš', FAMILY)
    expect(segments.map((s) => s.text).join('')).toBe('ahoj @Petra, jak se máš')
    expect(segments.filter((s) => s.member)).toHaveLength(1)
  })

  it('returns one plain segment when there is nothing to highlight', () => {
    expect(splitMentionText('ahoj', FAMILY)).toEqual([{ text: 'ahoj', member: null }])
  })
})
