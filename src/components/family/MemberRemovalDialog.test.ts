import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { makeActivity, makeChore, makeFamilyMember } from '../../utils/testFixtures'
import { MemberRemovalDialog } from './MemberRemovalDialog'

describe('MemberRemovalDialog', () => {
  it('explains historical preservation and offers safe reassignment strategies', () => {
    const member = makeFamilyMember({ id: 'member-remove', display_name: 'Iveta', role: 'parent', user_id: 'user-1' })
    const replacement = makeFamilyMember({ id: 'member-keep', display_name: 'Lukáš', role: 'admin' })
    const html = renderToStaticMarkup(createElement(MemberRemovalDialog, {
      member,
      activeMembers: [member, replacement],
      chores: [makeChore({ assigned_to: member.id })],
      activities: [makeActivity({ responsible_member_id: member.id, start_date: '2099-01-01' })],
      onConfirm: async () => undefined,
      onClose: () => undefined,
    }))
    expect(html).toContain('Odebrat člena Iveta z rodiny?')
    expect(html).toContain('Historie dokončených úkolů')
    expect(html).toContain('Propojený účet okamžitě ztratí přístup')
    expect(html).toContain('Ponechat bez přiřazení')
    expect(html).toContain('Převést na jiného člena')
  })
})
