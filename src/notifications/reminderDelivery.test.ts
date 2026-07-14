import { describe, expect, it } from 'vitest'
import { createDeliveryDrafts, deferPastQuietHours, localIsoWeek, zonedDateTimeToUtc } from './reminderDelivery'
import { defaultNotificationPreferences, type ReminderDraft } from './reminders'

const reminder = (overrides: Partial<ReminderDraft> = {}): ReminderDraft => ({
  dedupeKey: 'chore-today:child:2026-07-14', source: 'chore', type: 'chore-due-today', title: 'Dva úkoly',
  description: null, importance: 'normal', eventAt: '2026-07-14T12:00:00.000Z', generatedAt: '2026-07-14T06:00:00.000Z',
  expiresAt: null, deepLink: '/chores', groupingKey: 'chores:today:child', metadata: { sourceIds: ['one', 'two'], count: 2 }, ...overrides,
})

describe('server delivery scheduling', () => {
  it('converts Prague local time with summer and winter DST offsets', () => {
    expect(zonedDateTimeToUtc('2026-07-14', '08:00', 'Europe/Prague').toISOString()).toBe('2026-07-14T06:00:00.000Z')
    expect(zonedDateTimeToUtc('2026-03-29', '08:00', 'Europe/Prague').toISOString()).toBe('2026-03-29T06:00:00.000Z')
    expect(zonedDateTimeToUtc('2026-10-26', '08:00', 'Europe/Prague').toISOString()).toBe('2026-10-26T07:00:00.000Z')
  })

  it('defers a 21:00-07:00 quiet-hour delivery until the next local morning', () => {
    const preferences = { ...defaultNotificationPreferences('m', 'f', 'Europe/Prague'), quietHoursEnabled: true }
    expect(deferPastQuietHours(new Date('2026-07-14T20:00:00Z'), preferences).toISOString()).toBe('2026-07-15T05:00:00.000Z')
  })

  it('creates one deterministic daily digest per member and local date', () => {
    const preferences = { ...defaultNotificationPreferences('m', 'f', 'Europe/Prague'), dailyDigestEnabled: true }
    const input = { familyId: 'f', memberId: 'm', now: new Date('2026-07-14T07:00:00Z'), preferences, reminders: [reminder()] }
    const first = createDeliveryDrafts(input)
    const retry = createDeliveryDrafts(input)
    expect(first).toEqual(retry)
    expect(first).toMatchObject([{ deliveryType: 'daily_digest', idempotencyKey: 'daily-digest:m:2026-07-14' }])
  })

  it('does not create an empty digest or include a dismissed reminder', () => {
    const preferences = { ...defaultNotificationPreferences('m', 'f', 'UTC'), dailyDigestEnabled: true }
    expect(createDeliveryDrafts({ familyId: 'f', memberId: 'm', now: new Date('2026-07-14T09:00:00Z'), preferences, reminders: [] })).toEqual([])
    expect(createDeliveryDrafts({ familyId: 'f', memberId: 'm', now: new Date('2026-07-14T09:00:00Z'), preferences, reminders: [reminder()], existingState: { [reminder().dedupeKey]: { readAt: null, dismissedAt: '2026-07-14T08:00:00Z', resolvedAt: null } } })).toEqual([])
  })

  it('creates at most one weekly digest for the recipient local ISO week', () => {
    const preferences = { ...defaultNotificationPreferences('m', 'f', 'Pacific/Auckland'), weeklyDigestEnabled: true }
    const deliveries = createDeliveryDrafts({ familyId: 'f', memberId: 'm', now: new Date('2026-07-19T07:00:00Z'), preferences, reminders: [reminder({ eventAt: null })] })
    expect(deliveries[0]?.idempotencyKey).toBe(`weekly-digest:m:${localIsoWeek('2026-07-19')}`)
  })

  it('evaluates two recipients against their own local day in one UTC run', () => {
    const now = new Date('2026-07-14T07:00:00Z')
    const prague = { ...defaultNotificationPreferences('prague', 'f', 'Europe/Prague'), dailyDigestEnabled: true }
    const newYork = { ...defaultNotificationPreferences('new-york', 'f', 'America/New_York'), dailyDigestEnabled: true }
    expect(createDeliveryDrafts({ familyId: 'f', memberId: 'prague', now, preferences: prague, reminders: [reminder()] })).toHaveLength(1)
    expect(createDeliveryDrafts({ familyId: 'f', memberId: 'new-york', now, preferences: newYork, reminders: [reminder()] })).toHaveLength(0)
  })

  it('uses a new immediate idempotency key for a genuinely changed occurrence', () => {
    const preferences = { ...defaultNotificationPreferences('m', 'f', 'UTC'), pushEnabled: true }
    const first = createDeliveryDrafts({ familyId: 'f', memberId: 'm', now: new Date('2026-07-14T09:00:00Z'), preferences, reminders: [reminder()] })[0]
    const next = createDeliveryDrafts({ familyId: 'f', memberId: 'm', now: new Date('2026-07-14T09:00:00Z'), preferences, reminders: [reminder({ metadata: { sourceIds: ['three'], count: 1 } })] })[0]
    expect(first.idempotencyKey).not.toBe(next.idempotencyKey)
  })

  it('keeps the UI contract mutually exclusive when both digest flags are malformed', () => {
    const preferences = { ...defaultNotificationPreferences('m', 'f', 'UTC'), dailyDigestEnabled: true, weeklyDigestEnabled: true }
    const deliveries = createDeliveryDrafts({ familyId: 'f', memberId: 'm', now: new Date('2026-07-19T19:00:00Z'), preferences, reminders: [reminder({ eventAt: null })] })
    expect(deliveries.map((item) => item.deliveryType)).toEqual(['daily_digest'])
  })

  it('only prepares immediate deliveries when push is explicitly enabled', () => {
    const disabled = defaultNotificationPreferences('m', 'f', 'UTC')
    expect(createDeliveryDrafts({ familyId: 'f', memberId: 'm', now: new Date('2026-07-14T09:00:00Z'), preferences: disabled, reminders: [reminder()] })).toEqual([])
    const enabled = { ...disabled, pushEnabled: true }
    expect(createDeliveryDrafts({ familyId: 'f', memberId: 'm', now: new Date('2026-07-14T09:00:00Z'), preferences: enabled, reminders: [reminder()] })[0]?.deliveryType).toBe('immediate')
  })

  it('does not prepare an unchanged stale reminder as a fresh immediate delivery', () => {
    const preferences = { ...defaultNotificationPreferences('m', 'f', 'UTC'), pushEnabled: true }
    const draft = reminder()
    const first = createDeliveryDrafts({ familyId: 'f', memberId: 'm', now: new Date('2026-07-14T09:00:00Z'), preferences, reminders: [draft] })[0]
    expect(createDeliveryDrafts({
      familyId: 'f', memberId: 'm', now: new Date('2026-07-14T10:00:00Z'), preferences, reminders: [draft],
      existingState: { [draft.dedupeKey]: { readAt: null, dismissedAt: null, resolvedAt: null, generatedAt: '2026-07-14T09:00:00Z', occurrenceKey: String(first.metadata.occurrence) } },
    })).toEqual([])
  })
})
