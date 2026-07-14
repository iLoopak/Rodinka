import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../router', () => ({ Link: ({ children, to, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => <a href={to} {...props}>{children}</a> }))

import { compactReminderCount, ReminderBellView } from './ReminderBell'

describe('ReminderBell', () => {
  it('caps the badge and announces the real unread count', () => {
    const html = renderToStaticMarkup(<ReminderBellView unreadCount={14} hasImportantUnread />)
    expect(compactReminderCount(14)).toBe('9+')
    expect(html).toContain('9+')
    expect(html).toContain('14 nepřečtených připomínek')
    expect(html).toContain('reminder-bell important')
  })

  it('does not render a badge when everything is read', () => {
    const html = renderToStaticMarkup(<ReminderBellView unreadCount={0} hasImportantUnread={false} />)
    expect(html).not.toContain('reminder-badge')
    expect(html).toContain('aria-label="Připomínky"')
  })
})
