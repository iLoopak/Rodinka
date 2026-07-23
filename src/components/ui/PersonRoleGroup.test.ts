import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { makeFamilyMember } from '../../utils/testFixtures'
import { PersonRoleGroup } from './PersonRoleGroup'

describe('PersonRoleGroup', () => {
  it('renders one identity with multiple explained roles', () => {
    const member = makeFamilyMember({ id: 'adult', display_name: 'Alex' })
    const html = renderToStaticMarkup(createElement(PersonRoleGroup, { roles: [
      { member, label: 'Participant' },
      { member, label: 'Responsible adult' },
    ] }))

    expect(html.match(/class="member-avatar/g)).toHaveLength(1)
    expect(html.match(/<strong>Alex<\/strong>/g)).toHaveLength(1)
    expect(html).toContain('Participant · Responsible adult')
  })

  it('renders larger avatars for the "large" variant, used by prominent detail-modal people blocks', () => {
    const member = makeFamilyMember({ id: 'adult', display_name: 'Alex' })
    const defaultHtml = renderToStaticMarkup(createElement(PersonRoleGroup, { roles: [{ member, label: 'Participant' }] }))
    const largeHtml = renderToStaticMarkup(createElement(PersonRoleGroup, { roles: [{ member, label: 'Participant' }], size: 'large' }))

    expect(largeHtml).toContain('person-role-group large')
    expect(largeHtml).toMatch(/width:\s*56px/)
    expect(defaultHtml).not.toMatch(/width:\s*56px/)
  })
})
