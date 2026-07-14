import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { makeChore, makeFamilyMember } from '../utils/testFixtures'
import { AddChoreForm } from './AddChoreForm'

const member = makeFamilyMember({ id: 'child-1', display_name: 'Anička' })
const submit = async () => undefined

describe('AddChoreForm', () => {
  it('offers all structured recurrence types when creating a chore', () => {
    const html = renderToStaticMarkup(createElement(AddChoreForm, {
      members: [member], currentMemberId: 'parent-1', onSubmit: submit,
    }))

    expect(html).toContain('Neopakovat')
    expect(html).toContain('Denně / ve vybrané dny')
    expect(html).toContain('Týdně')
    expect(html).toContain('Měsíčně')
    expect(html).toContain('Neopakuje se')
    expect(html).toContain('Bez přiřazení')
    expect(html).toContain('Další možnosti')
    expect(html).not.toContain('Přidat odměnu')
  })

  it('prefills edit values and exposes selected daily weekdays accessibly', () => {
    const html = renderToStaticMarkup(createElement(AddChoreForm, {
      members: [member],
      currentMemberId: 'parent-1',
      initial: makeChore({
        title: 'Uklidit pokoj',
        assigned_to: member.id,
        due_date: '2026-07-16',
        recurrence_type: 'daily',
        recurrence_weekdays: [2, 4],
        recurring: true,
      }),
      onSubmit: submit,
    }))

    expect(html).toContain('value="Uklidit pokoj"')
    expect(html).toContain('value="2026-07-16"')
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(2)
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(5)
    expect(html).toContain('Každé úterý a čtvrtek')
    expect(html).toContain('Uložit změny')
  })
})
