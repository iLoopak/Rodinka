import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MemberAvatar } from './MemberAvatar'

const member = {
  id: 'member-1',
  display_name: 'Lukáš Sitto',
  color_key: 'sky' as const,
  avatar_url: 'https://example.test/lukas.jpg',
}

describe('MemberAvatar', () => {
  it('can deliberately render initials instead of an uploaded photo', () => {
    const html = renderToStaticMarkup(createElement(MemberAvatar, {
      member,
      size: 14,
      forceInitials: true,
    }))

    expect(html).toContain('LS')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('has-photo')
  })

  it('keeps uploaded photos enabled by default', () => {
    const html = renderToStaticMarkup(createElement(MemberAvatar, { member, size: 36 }))

    expect(html).toContain('<img')
    expect(html).toContain('has-photo')
  })
})
