// @vitest-environment jsdom
import { createElement } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ReactionsRow } from './ReactionsRow'
import type { MessageReactionRow } from '../../context/messages/types'

const reaction = (member_id: string, emoji: string): MessageReactionRow => ({
  message_id: 'm-1',
  member_id,
  emoji,
  family_id: 'fam-1',
  created_at: '2026-07-17T10:00:00Z',
})

const memberName = (id: string) => `member-${id}`

describe('ReactionsRow', () => {
  it('renders nothing when the message has no reactions', () => {
    const { container } = render(createElement(ReactionsRow, {
      reactions: [], currentMemberId: 'me', onToggle: () => undefined, memberName,
    }))
    expect(container.firstChild).toBeNull()
  })

  it('groups multiple reactions of the same emoji into one chip with a count', () => {
    render(createElement(ReactionsRow, {
      reactions: [reaction('a', '❤️'), reaction('b', '❤️'), reaction('c', '😂')],
      currentMemberId: 'me',
      onToggle: () => undefined,
      memberName,
    }))
    const heartChip = screen.getByTitle('member-a, member-b')
    expect(heartChip.textContent).toContain('❤️')
    expect(heartChip.textContent).toContain('2')
    expect(screen.getByTitle('member-c').textContent).toContain('😂')
  })

  it('marks the current member reactions as mine', () => {
    render(createElement(ReactionsRow, {
      reactions: [reaction('me', '👍'), reaction('a', '❤️')],
      currentMemberId: 'me',
      onToggle: () => undefined,
      memberName,
    }))
    const mine = screen.getByTitle('member-me')
    expect(mine.className).toContain('is-mine')
    const others = screen.getByTitle('member-a')
    expect(others.className).not.toContain('is-mine')
  })

  it('supports the same member reacting with several distinct emoji', () => {
    // Composite PK in the DB is (message, member, emoji), so a member
    // may hold several reactions at once — the UI must render each
    // as its own chip rather than swallow duplicates.
    const { container } = render(createElement(ReactionsRow, {
      reactions: [reaction('me', '❤️'), reaction('me', '😂')],
      currentMemberId: 'me',
      onToggle: () => undefined,
      memberName,
    }))
    const chips = container.querySelectorAll('.messages-reaction-chip')
    expect(chips).toHaveLength(2)
    expect([...chips].filter((c) => c.className.includes('is-mine'))).toHaveLength(2)
  })

  it('forwards clicks to onToggle with the emoji so the caller can idempotently toggle', () => {
    const onToggle = vi.fn()
    const { container } = render(createElement(ReactionsRow, {
      reactions: [reaction('me', '❤️')],
      currentMemberId: 'me',
      onToggle,
      memberName,
    }))
    const chip = container.querySelector('.messages-reaction-chip')!
    fireEvent.click(chip)
    expect(onToggle).toHaveBeenCalledWith('❤️')
  })
})
