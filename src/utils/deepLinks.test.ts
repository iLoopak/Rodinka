/// <reference types="node" />

import { describe, expect, it, vi } from 'vitest'
import {
  buildDeepLink,
  isValidISODate,
  queryParam,
  resolveDeepLinkedItem,
  shareDeepLink,
  updateQueryParam,
  updateUrlQuery,
} from './deepLinks'

const id = '123e4567-e89b-42d3-a456-426614174000'

describe('deep-link utilities', () => {
  it('parses supported query parameters', () => {
    expect(queryParam(`?chore=${id}&view=active`, 'chore')).toBe(id)
    expect(queryParam('?date=2026-07-18', 'date')).toBe('2026-07-18')
    expect(queryParam('', 'record')).toBeNull()
  })

  it('preserves unrelated parameters while setting and removing one parameter', () => {
    const opened = updateQueryParam('?filter=mine&tab=active', 'chore', id)
    expect(opened).toBe(`?filter=mine&tab=active&chore=${id}`)
    expect(updateQueryParam(opened, 'chore', null)).toBe('?filter=mine&tab=active')
  })

  it('keeps pathname and hash unchanged when a detail is opened or closed', () => {
    const opened = updateUrlQuery('https://rodinka.example/chores?filter=mine#active', 'chore', id)
    expect(opened).toBe(`/chores?filter=mine&chore=${id}#active`)
    expect(updateUrlQuery(`https://rodinka.example${opened}`, 'chore', null)).toBe('/chores?filter=mine#active')
  })

  it('validates real calendar dates instead of accepting normalized dates', () => {
    expect(isValidISODate('2026-07-18')).toBe(true)
    expect(isValidISODate('2024-02-29')).toBe(true)
    expect(isValidISODate('2026-02-29')).toBe(false)
    expect(isValidISODate('2026-13-01')).toBe(false)
    expect(isValidISODate('18-07-2026')).toBe(false)
  })

  it('opens an item only after it is present in family-scoped data', () => {
    expect(resolveDeepLinkedItem([], id)).toEqual({ status: 'not_found' })
    const item = { id, title: 'Dentist' }
    expect(resolveDeepLinkedItem([item], id)).toEqual({ status: 'found', item })
  })

  it('uses the same neutral not-found state for absent or unauthorized items', () => {
    expect(resolveDeepLinkedItem([], id).status).toBe('not_found')
    expect(resolveDeepLinkedItem([], 'not-a-uuid').status).toBe('invalid')
  })

  it('builds an absolute link containing only the record id', () => {
    expect(buildDeepLink('https://rodinka.example', '/health', 'record', id))
      .toBe(`https://rodinka.example/health?record=${id}`)
  })

  it('falls back to the clipboard when Web Share is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    await expect(shareDeepLink('https://rodinka.example/health', 'Dentist', { clipboard: { writeText } }))
      .resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith('https://rodinka.example/health')
  })
})
