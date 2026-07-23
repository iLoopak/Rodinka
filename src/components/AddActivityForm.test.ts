import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { makeActivity, makeFamilyMember } from '../utils/testFixtures'
import { AddActivityForm } from './AddActivityForm'

const child = makeFamilyMember({ id: 'child-1', display_name: 'Richard Novák', role: 'child' })
const parent = makeFamilyMember({ id: 'parent-1', display_name: 'Lukáš Novák', role: 'admin' })
const members = [parent, child]
const submit = async () => undefined

/** The one category chip marked aria-checked="true", or null if none/more than one is. */
function checkedCategoryChip(html: string): string | null {
  const matches = [...html.matchAll(/aria-checked="true"[\s\S]*?<\/button>/g)]
  return matches.length === 1 ? matches[0][0] : null
}

function renderForm(initial?: ReturnType<typeof makeActivity>) {
  return renderToStaticMarkup(createElement(AddActivityForm, {
    members,
    kids: [child],
    initial,
    onSubmit: submit,
  }))
}

describe('AddActivityForm progressive disclosure', () => {
  it('renders the fast creation fields while keeping advanced groups collapsed', () => {
    const html = renderForm()

    expect(html).toContain('Kroužek nebo pravidelná aktivita')
    expect(html).toContain('Richard')
    expect(html).toContain('Celá rodina')
    expect(html).toContain('Datum a čas')
    expect(html).toContain('Přidat další podrobnosti')
    expect(html).toContain('activity-form-footer')
    expect(html).not.toContain('Kontakt na organizátora')
    expect(html).not.toContain('Sledovat platby')
    expect(html).not.toContain('Poznámky')
  })

  it('automatically expands and prefills advanced values when editing', () => {
    const html = renderForm(makeActivity({
      title: 'Plavání',
      participant_ids: [child.id],
      category: 'swimming',
      skill_level: 'Pokročilý',
      coach_name: 'Jan Trenér',
      coach_phone: '+420 123 456 789',
      payment_amount: 1200,
      payment_frequency: 'term',
      reminder_enabled: true,
      reminder_days_before: 2,
      notes: 'Vzít plavky',
    }))

    expect(html).toContain('Skrýt další podrobnosti')
    expect(html).toContain('value="Pokročilý"')
    expect(html).toContain('value="Jan Trenér"')
    expect(html).toContain('value="1200"')
    expect(html).toContain('Vzít plavky')
    expect(html).toContain('value="2"')
    expect(checkedCategoryChip(html)).toContain('Plavání')
  })

  it('shows selected participants and hides time inputs in all-day mode', () => {
    const html = renderForm(makeActivity({
      kind: 'event',
      category: 'other_event',
      all_day: true,
      participant_ids: [parent.id, child.id],
    }))

    expect(html.match(/aria-pressed="true"/g)?.length).toBeGreaterThanOrEqual(3)
    expect(html).not.toContain('type="time"')
    expect(html).toContain('checked=""')
  })

  it('keeps saved event-only advanced values visible instead of discarding them', () => {
    const html = renderForm(makeActivity({
      kind: 'event',
      category: 'celebration',
      participant_ids: [child.id],
      coach_email: 'organizer@example.com',
      payment_amount: 500,
    }))

    expect(html).toContain('value="organizer@example.com"')
    expect(html).toContain('value="500"')
    expect(checkedCategoryChip(html)).toContain('Oslava')
  })
})
