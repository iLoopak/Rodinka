import { useMemo, useState } from 'react'
import { useReminders } from '../../context/ReminderContext'
import { useRouter } from '../../router'
import { buildDigest, reminderSection, type ReminderSection } from '../../notifications/reminderPresentation'
import { REMINDER_CATEGORIES, browserTimezone, type NotificationPreferences, type ReminderRecord } from '../../notifications/reminders'
import { usePush } from '../../context/PushContext'
import { t } from '../../strings'
import { localeFor } from '../../i18n/language'
import { getCurrentLanguage } from '../../i18n'
import { ScrollableTabs } from '../ui/ScrollableTabs'
import { ScreenHeader } from '../ui/ScreenHeader'
import { CheckCircle, Coins, Dumbbell, FileText, ShoppingCart, Stethoscope, Syringe, Utensils, Vote } from 'lucide-react'
import { useFamilyCore } from '../../context/family/FamilyCoreContext'
import { capabilitiesFor } from '../../utils/uiCapabilities'

type Tab = 'active' | 'history' | 'settings'
const sourceIcons = {
  chore: CheckCircle, activity: Dumbbell, 'activity-payment': Coins, 'medical-appointment': Stethoscope,
  vaccination: Syringe, voting: Vote, 'meal-plan': Utensils, allowance: Coins, document: FileText, shopping: ShoppingCart,
} satisfies Record<ReminderRecord['source'], typeof CheckCircle>
const CHILD_HIDDEN_SOURCES: ReminderRecord['source'][] = ['activity-payment', 'medical-appointment', 'vaccination', 'allowance', 'document']
const CHILD_REMINDER_CATEGORIES = REMINDER_CATEGORIES.filter((category) => !['medical', 'allowance', 'documents'].includes(category))

function sectionLabel(section: ReminderSection) {
  return { overdue: t.reminders.sectionOverdue, today: t.reminders.sectionToday, upcoming: t.reminders.sectionUpcoming, earlier: t.reminders.sectionEarlier }[section]
}

function categoryLabel(category: (typeof REMINDER_CATEGORIES)[number]) {
  return { chores: t.reminders.categoryChores, activities: t.reminders.categoryActivities, medical: t.reminders.categoryMedical, voting: t.reminders.categoryVoting, meals: t.reminders.categoryMeals, allowance: t.reminders.categoryAllowance, documents: t.reminders.categoryDocuments, shopping: t.reminders.categoryShopping }[category]
}

function reminderSourceLabel(source: ReminderRecord['source']) {
  if (source === 'chore') return t.reminders.categoryChores
  if (source === 'activity' || source === 'activity-payment') return t.reminders.categoryActivities
  if (source === 'medical-appointment' || source === 'vaccination') return t.reminders.categoryMedical
  if (source === 'voting') return t.reminders.categoryVoting
  if (source === 'meal-plan') return t.reminders.categoryMeals
  if (source === 'allowance') return t.reminders.categoryAllowance
  if (source === 'document') return t.reminders.categoryDocuments
  return t.reminders.categoryShopping
}

function canDismiss(item: ReminderRecord) {
  return ['activity-payment', 'meal-plan', 'document', 'shopping'].includes(item.source)
}

export function ReminderCenter() {
  const { active, history, preferences, loading, error, markRead, markAllRead, dismiss, savePreferences } = useReminders()
  const { currentMember } = useFamilyCore()
  const capabilities = capabilitiesFor(currentMember)
  const { navigateHref } = useRouter()
  const [tab, setTab] = useState<Tab>(() => window.location.hash === '#settings' ? 'settings' : 'active')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const visibleActive = capabilities.isChild ? active.filter((item) => !CHILD_HIDDEN_SOURCES.includes(item.source)) : active
  const visibleHistory = capabilities.isChild ? history.filter((item) => !CHILD_HIDDEN_SOURCES.includes(item.source)) : history
  const visibleUnreadCount = visibleActive.filter((item) => !item.readAt).length
  const digest = useMemo(() => buildDigest(visibleActive, preferences.dailyDigestEnabled ? 'daily' : 'weekly', new Date(), preferences.timezone), [visibleActive, preferences.dailyDigestEnabled, preferences.timezone])
  const sections = useMemo(() => {
    const result = new Map<ReminderSection, ReminderRecord[]>()
    for (const item of visibleActive) {
      const section = reminderSection(item, new Date(), preferences.timezone)
      result.set(section, [...(result.get(section) ?? []), item])
    }
    return result
  }, [visibleActive, preferences.timezone])

  async function open(item: ReminderRecord) {
    if (!item.readAt) await markRead(item.id)
    navigateHref(item.deepLink || '/reminders')
    window.setTimeout(() => document.querySelector<HTMLElement>('h1')?.focus(), 0)
  }

  async function changePreferences(next: NotificationPreferences) {
    setSaving(true); setFeedback(null)
    try { await savePreferences({ ...next, locale: getCurrentLanguage() }); setFeedback(t.reminders.settingsSaved) }
    catch { setFeedback(t.reminders.settingsSaveFailed) }
    finally { setSaving(false) }
  }

  if (loading) return <p className="loading">{t.reminders.loading}</p>

  const tabs: { id: Tab; label: string }[] = [{ id: 'active', label: t.reminders.tabActive(visibleUnreadCount) }, { id: 'history', label: t.reminders.tabHistory }, { id: 'settings', label: t.reminders.tabSettings }]
  return <div className="reminder-center">
    <ScreenHeader className="reminder-center-header" title={t.reminders.title} subtitle={t.reminders.subtitle} titleTabIndex={-1}
      actions={tab === 'active' && visibleUnreadCount > 0 ? <button className="btn-secondary" onClick={() => markAllRead()}>{t.reminders.markAllRead}</button> : undefined} />
    <ScrollableTabs tabs={tabs} activeTab={tab} onChange={setTab} />
    {error && <p className="form-error" role="alert">{t.errors.generic}</p>}
    {tab === 'active' && <>{(preferences.dailyDigestEnabled || preferences.weeklyDigestEnabled) && <section className="digest-preview reminder-digest"><span><strong>{preferences.dailyDigestEnabled ? t.reminders.dailyDigest : t.reminders.weeklyDigest}</strong><small>{t.reminders.digestCounts(digest.items.length, digest.important)}</small></span><button className="link" onClick={() => setTab('settings')}>{t.reminders.tabSettings}</button></section>}{visibleActive.length === 0 ? <div className="reminder-empty"><span aria-hidden="true"><CheckCircle size={24} /></span><h2>{t.reminders.allDoneTitle}</h2><p>{t.reminders.allDoneBody}</p><button className="link" onClick={() => setTab('settings')}>{t.reminders.reminderSettings}</button></div> : <div className="panel is-primary reminder-sections">{(['overdue', 'today', 'upcoming', 'earlier'] as ReminderSection[]).map((section) => {
      const items = sections.get(section); if (!items?.length) return null
      return <section key={section} className="reminder-section"><h2>{sectionLabel(section)} <span>{items.length}</span></h2><ul className="reminder-list">{items.map((item) => <ReminderCard key={item.id} item={item} onOpen={() => open(item)} onRead={() => markRead(item.id)} onDismiss={() => dismiss(item.id)} />)}</ul></section>
    })}</div>}</>}
    {tab === 'history' && (visibleHistory.length === 0 ? <div className="reminder-empty"><h2>{t.reminders.historyEmpty}</h2></div> : <div className="panel is-primary reminder-history"><ul className="reminder-list">{visibleHistory.map((item) => <ReminderCard key={item.id} item={item} onOpen={() => open(item)} onRead={() => markRead(item.id)} onDismiss={() => dismiss(item.id)} />)}</ul></div>)}
    {tab === 'settings' && <ReminderSettings preferences={preferences} reminders={visibleActive} saving={saving} feedback={feedback} categories={capabilities.isChild ? CHILD_REMINDER_CATEGORIES : REMINDER_CATEGORIES} onChange={changePreferences} />}
  </div>
}

function ReminderCard({ item, onOpen, onRead, onDismiss }: { item: ReminderRecord; onOpen: () => void; onRead: () => void; onDismiss: () => void }) {
  const state = item.resolvedAt ? t.reminders.stateResolved : item.dismissedAt ? t.reminders.stateDismissed : item.readAt ? t.reminders.stateRead : t.reminders.stateUnread
  const SourceIcon = sourceIcons[item.source]
  return <li className={`reminder-card ${item.importance}${item.readAt ? ' read' : ' unread'}`} aria-label={`${item.title}, ${state}`}>
    <button className="reminder-open" onClick={onOpen}><span className="reminder-icon" aria-hidden="true"><SourceIcon size={20} /></span><span className="reminder-copy"><span className="reminder-card-title">{item.title}</span>{item.description && <span className="reminder-description">{item.description}</span>}<span className="reminder-meta">{item.importance === 'important' ? `${t.reminders.important} · ` : ''}{reminderSourceLabel(item.source)}</span></span>{!item.readAt && <span className="unread-dot"><span className="sr-only">{t.reminders.stateUnread}</span></span>}</button>
    <div className="reminder-actions">{!item.readAt && <button className="link" onClick={onRead}>{t.reminders.markRead}</button>}{!item.resolvedAt && !item.dismissedAt && canDismiss(item) && <button className="link" onClick={onDismiss}>{t.reminders.dismiss}</button>}</div>
  </li>
}

function ReminderSettings({ preferences, reminders, saving, feedback, categories, onChange }: { preferences: NotificationPreferences; reminders: ReminderRecord[]; saving: boolean; feedback: string | null; categories: readonly (typeof REMINDER_CATEGORIES)[number][]; onChange: (next: NotificationPreferences) => Promise<void> }) {
  const digestKind = preferences.dailyDigestEnabled ? 'daily' : 'weekly'
  const digest = buildDigest(reminders, digestKind, new Date(), preferences.timezone)
  const toggle = (key: keyof NotificationPreferences, value: boolean) => onChange({ ...preferences, [key]: value })
  const detectedTimezone = browserTimezone()
  const supportedTimezones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC']
  const timezoneOptions = supportedTimezones.includes(preferences.timezone) ? supportedTimezones : [preferences.timezone, ...supportedTimezones]
  return <div className="reminder-settings">
    <section className="page-section"><h2 className="section-heading">{t.reminders.deliveryTitle}</h2><div className="panel is-primary reminder-settings-panel"><label className="setting-row"><span><strong>{t.reminders.inAppTitle}</strong><small>{t.reminders.inAppBody}</small></span><input type="checkbox" checked={preferences.inAppEnabled} onChange={(event) => toggle('inAppEnabled', event.target.checked)} disabled={saving} /></label><label className="setting-row"><span><strong>{t.reminders.quietPushTitle}</strong><small>{t.reminders.quietPushBody}</small></span><input type="checkbox" checked={preferences.quietPushEnabled} onChange={(event) => toggle('quietPushEnabled', event.target.checked)} disabled={saving} /></label><PushSettings preferences={preferences} saving={saving} onChange={onChange} /></div></section>
    <section className="page-section"><h2 className="section-heading">{t.reminders.summariesTitle}</h2><div className="panel is-primary reminder-settings-panel"><p className="row-meta">{t.reminders.summariesBody}</p><label className="setting-row"><span><strong>{t.reminders.dailyDigest}</strong><small>{t.reminders.dailyDigestBody}</small></span><input type="checkbox" checked={preferences.dailyDigestEnabled} onChange={(event) => onChange({ ...preferences, dailyDigestEnabled: event.target.checked, weeklyDigestEnabled: event.target.checked ? false : preferences.weeklyDigestEnabled })} disabled={saving} /></label><label className="setting-row"><span><strong>{t.reminders.weeklyDigest}</strong><small>{t.reminders.weeklyDigestBody}</small></span><input type="checkbox" checked={preferences.weeklyDigestEnabled} onChange={(event) => onChange({ ...preferences, weeklyDigestEnabled: event.target.checked, dailyDigestEnabled: event.target.checked ? false : preferences.dailyDigestEnabled })} disabled={saving} /></label>{(preferences.dailyDigestEnabled || preferences.weeklyDigestEnabled) && <div className="digest-preview"><strong>{t.reminders.digestPreview}</strong><span>{t.reminders.digestCounts(digest.items.length, digest.important)}</span></div>}</div></section>
    <section className="page-section"><h2 className="section-heading">{t.reminders.categoriesTitle}</h2><div className="panel is-primary reminder-settings-panel"><div className="category-settings">{categories.map((category) => <label className="setting-row" key={category}><span>{categoryLabel(category)}</span><input type="checkbox" checked={preferences.categories[category]} onChange={(event) => onChange({ ...preferences, categories: { ...preferences.categories, [category]: event.target.checked } })} disabled={saving} /></label>)}</div></div></section>
    <section className="page-section"><h2 className="section-heading">{t.reminders.timeTitle}</h2><div className="panel is-primary reminder-settings-panel"><label className="setting-row"><span><strong>{t.reminders.timezoneAuto}</strong><small>{t.reminders.timezoneDetected(detectedTimezone)}</small></span><input type="checkbox" checked={preferences.timezoneMode === 'auto'} onChange={(event) => onChange({ ...preferences, timezoneMode: event.target.checked ? 'auto' : 'explicit', timezone: event.target.checked ? detectedTimezone : preferences.timezone })} disabled={saving} /></label>{preferences.timezoneMode === 'explicit' && <label className="setting-row"><span><strong>{t.reminders.timezoneCustom}</strong><small>{t.reminders.timezoneCustomBody}</small></span><select value={preferences.timezone} onChange={(event) => onChange({ ...preferences, timezone: event.target.value })} disabled={saving}>{timezoneOptions.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}</select></label>}<label className="setting-row"><span><strong>{t.reminders.quietHoursTitle}</strong><small>{t.reminders.quietHoursBody}</small></span><input type="checkbox" checked={preferences.quietHoursEnabled} onChange={(event) => toggle('quietHoursEnabled', event.target.checked)} disabled={saving} /></label>{preferences.quietHoursEnabled && <div className="quiet-hours"><label>{t.reminders.quietFrom} <input type="time" value={preferences.quietHoursStart} onChange={(event) => onChange({ ...preferences, quietHoursStart: event.target.value })} /></label><label>{t.reminders.quietTo} <input type="time" value={preferences.quietHoursEnd} onChange={(event) => onChange({ ...preferences, quietHoursEnd: event.target.value })} /></label></div>}<p className="row-meta">{t.reminders.timezoneUsed(preferences.timezone)}</p></div></section>
    {feedback && <p className="shopping-feedback" role="status">{feedback}</p>}
  </div>
}

function PushSettings({ preferences, saving, onChange }: { preferences: NotificationPreferences; saving: boolean; onChange: (next: NotificationPreferences) => Promise<void> }) {
  const push = usePush()
  const [showIntro, setShowIntro] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const activeDevices = push.devices.filter((device) => !device.revokedAt && !device.disabledAt)
  const otherDevices = activeDevices.filter((device) => !device.current).length
  const stateCopy: Record<string, string> = {
    insecure: t.reminders.capabilityInsecure,
    'service-worker-unavailable': t.reminders.capabilityServiceWorker,
    'notifications-unavailable': t.reminders.capabilityNotifications,
    'push-unavailable': t.reminders.capabilityPush,
    'missing-vapid-key': t.reminders.capabilityVapid,
    blocked: t.reminders.capabilityBlocked,
  }

  async function enable() {
    setMessage(null)
    try {
      await push.enableCurrentDevice()
      if (!preferences.pushEnabled) await onChange({ ...preferences, pushEnabled: true })
      setShowIntro(false)
      setMessage(t.reminders.deviceRegistered)
    } catch { setMessage(t.reminders.enableFailed) }
  }

  async function disableCurrent() {
    setMessage(null)
    try { await push.disableCurrentDevice(); setMessage(t.reminders.deviceDisabled) }
    catch { setMessage(t.reminders.deviceRemoveFailed) }
  }

  async function disableAccount() {
    try { await onChange({ ...preferences, pushEnabled: false }); setMessage(t.reminders.accountDisabled) }
    catch { /* Parent settings feedback already contains the error. */ }
  }

  async function test() {
    setMessage(t.reminders.testSending)
    try { await push.sendTest(); setMessage(t.reminders.testSent) }
    catch { setMessage(t.reminders.testFailed) }
  }

  return <div className="push-settings">
    <div className="setting-row push-summary"><span><strong>{t.reminders.pushTitle}</strong><small>{preferences.pushEnabled ? `${t.reminders.enabledForAccount}${otherDevices ? ` · ${t.reminders.otherDevices(otherDevices)}` : ''}` : t.reminders.disabledForAccount} · {t.reminders.thisDevice}: {push.currentDevice ? t.reminders.registered : push.browserSubscribed ? t.reminders.syncing : t.reminders.unregistered}</small></span><span className={`status-pill ${preferences.pushEnabled ? 'active' : ''}`}>{preferences.pushEnabled ? t.reminders.enabled : t.reminders.disabled}</span></div>
    {push.capability.code === 'ios-install-required' ? <div className="push-guidance"><strong>{t.reminders.iosInstallTitle}</strong><ol><li>{t.reminders.iosStepShare}</li><li>{t.reminders.iosStepHome}</li><li>{t.reminders.iosStepLaunch}</li><li>{t.reminders.iosStepEnable}</li></ol></div>
      : push.capability.code !== 'supported' ? <p className="row-meta push-warning">{stateCopy[push.capability.code]}</p>
        : !push.currentDevice ? <button type="button" className="btn-secondary" disabled={push.busy || push.loading || saving} onClick={() => setShowIntro(true)}>{t.reminders.enableDevice}</button>
          : <div className="push-actions"><button type="button" className="btn-secondary" disabled={push.busy || saving || !preferences.pushEnabled} onClick={test}>{t.reminders.testPush}</button><button type="button" className="link" disabled={push.busy} onClick={disableCurrent}>{t.reminders.disableDevice}</button></div>}
    {preferences.pushEnabled && <button type="button" className="link danger-link" disabled={push.busy || saving} onClick={disableAccount}>{t.reminders.disableAccount}</button>}
    {showIntro && <section className="push-consent" aria-labelledby="push-consent-title"><strong id="push-consent-title">{t.reminders.consentTitle}</strong><p>{t.reminders.consentBody}</p><div className="modal-actions"><button type="button" onClick={enable} disabled={push.busy}>{t.reminders.allow}</button><button type="button" className="btn-secondary" onClick={() => setShowIntro(false)} disabled={push.busy}>{t.reminders.notNow}</button></div></section>}
    {activeDevices.length > 0 && <div className="push-devices"><h3>{t.reminders.devicesTitle}</h3>{activeDevices.map((device) => <div className="push-device" key={device.id}><span><strong>{device.deviceName || t.reminders.browserDevice}{device.current ? t.reminders.currentDeviceSuffix : ''}</strong><small>{t.reminders.lastActive(new Date(device.lastSeenAt).toLocaleDateString(localeFor(getCurrentLanguage())))}</small></span><button type="button" className="link" disabled={push.busy} onClick={() => push.revokeDevice(device.id).catch(() => undefined)}>{t.reminders.remove}</button></div>)}</div>}
    {(message || push.error) && <p className="shopping-feedback" role={push.error ? 'alert' : 'status'}>{message || t.errors.generic}</p>}
  </div>
}
