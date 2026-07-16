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
})
