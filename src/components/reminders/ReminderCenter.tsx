import { useMemo, useState } from 'react'
import { useReminders } from '../../context/ReminderContext'
import { useRouter } from '../../router'
import { buildDigest, reminderSection, type ReminderSection } from '../../notifications/reminderPresentation'
import { REMINDER_CATEGORIES, browserTimezone, type NotificationPreferences, type ReminderRecord } from '../../notifications/reminders'
import { usePush } from '../../context/PushContext'

type Tab = 'active' | 'history' | 'settings'
const sectionLabels: Record<ReminderSection, string> = { overdue: 'Po termínu', today: 'Dnes', upcoming: 'Nadcházející', earlier: 'Bez termínu' }
const categoryLabels = { chores: 'Úkoly', activities: 'Aktivity', medical: 'Zdraví', voting: 'Hlasování', meals: 'Jídlo', allowance: 'Kapesné', documents: 'Dokumenty', shopping: 'Nákupy' }
const sourceIcons: Record<ReminderRecord['source'], string> = { chore: '✓', activity: '◷', 'activity-payment': 'Kč', 'medical-appointment': '+', vaccination: '+', voting: '☝', 'meal-plan': '♨', allowance: '★', document: '▤', shopping: '⌑' }

function canDismiss(item: ReminderRecord) {
  return ['activity-payment', 'meal-plan', 'document', 'shopping'].includes(item.source)
}

export function ReminderCenter() {
  const { active, history, unreadCount, preferences, loading, error, markRead, markAllRead, dismiss, savePreferences } = useReminders()
  const { navigateHref } = useRouter()
  const [tab, setTab] = useState<Tab>(() => window.location.hash === '#settings' ? 'settings' : 'active')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const digest = useMemo(() => buildDigest(active, preferences.dailyDigestEnabled ? 'daily' : 'weekly', new Date(), preferences.timezone), [active, preferences.dailyDigestEnabled, preferences.timezone])
  const sections = useMemo(() => {
    const result = new Map<ReminderSection, ReminderRecord[]>()
    for (const item of active) {
      const section = reminderSection(item, new Date(), preferences.timezone)
      result.set(section, [...(result.get(section) ?? []), item])
    }
    return result
  }, [active, preferences.timezone])

  async function open(item: ReminderRecord) {
    if (!item.readAt) await markRead(item.id)
    navigateHref(item.deepLink || '/reminders')
    window.setTimeout(() => document.querySelector<HTMLElement>('h1')?.focus(), 0)
  }

  async function changePreferences(next: NotificationPreferences) {
    setSaving(true); setFeedback(null)
    try { await savePreferences(next); setFeedback('Nastavení je uložené.') }
    catch (caught) { setFeedback(caught instanceof Error ? caught.message : 'Nastavení se nepodařilo uložit.'); throw caught }
    finally { setSaving(false) }
  }

  if (loading) return <p className="loading">Načítám připomínky…</p>

  const tabs: { id: Tab; label: string }[] = [{ id: 'active', label: `Aktivní${unreadCount ? ` (${unreadCount})` : ''}` }, { id: 'history', label: 'Historie' }, { id: 'settings', label: 'Nastavení' }]
  return <>
    <div className="screen-header reminder-center-header"><div><h1 className="home-title" tabIndex={-1}>Připomínky</h1><p className="home-subtitle">Co je dobré zařídit, pohromadě a bez zbytečného hluku.</p></div>{tab === 'active' && unreadCount > 0 && <button className="btn-secondary" onClick={() => markAllRead()}>Přečíst vše</button>}</div>
    <div className="tabs" role="tablist">{tabs.map((item) => <button key={item.id} className={`tab-button${tab === item.id ? ' active' : ''}`} role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {tab === 'active' && <>{(preferences.dailyDigestEnabled || preferences.weeklyDigestEnabled) && <section className="digest-preview reminder-digest"><span><strong>{preferences.dailyDigestEnabled ? 'Denní přehled' : 'Týdenní přehled'}</strong><small>{digest.items.length} aktivních · {digest.important} důležitých</small></span><button className="link" onClick={() => setTab('settings')}>Nastavení</button></section>}{active.length === 0 ? <div className="reminder-empty"><span aria-hidden="true">✓</span><h2>Máte všechno hotovo</h2><p>Nové připomínky se tu objeví, až bude potřeba něco zařídit.</p><button className="link" onClick={() => setTab('settings')}>Nastavení připomínek</button></div> : <div className="reminder-sections">{(['overdue', 'today', 'upcoming', 'earlier'] as ReminderSection[]).map((section) => {
      const items = sections.get(section); if (!items?.length) return null
      return <section key={section} className="reminder-section"><h2>{sectionLabels[section]} <span>{items.length}</span></h2><div className="reminder-list">{items.map((item) => <ReminderCard key={item.id} item={item} onOpen={() => open(item)} onRead={() => markRead(item.id)} onDismiss={() => dismiss(item.id)} />)}</div></section>
    })}</div>}</>}
    {tab === 'history' && (history.length === 0 ? <div className="reminder-empty"><h2>Historie je zatím prázdná</h2></div> : <div className="reminder-list reminder-history">{history.map((item) => <ReminderCard key={item.id} item={item} onOpen={() => open(item)} onRead={() => markRead(item.id)} onDismiss={() => dismiss(item.id)} />)}</div>)}
    {tab === 'settings' && <ReminderSettings preferences={preferences} reminders={active} saving={saving} feedback={feedback} onChange={changePreferences} />}
  </>
}

function ReminderCard({ item, onOpen, onRead, onDismiss }: { item: ReminderRecord; onOpen: () => void; onRead: () => void; onDismiss: () => void }) {
  const state = item.resolvedAt ? 'Vyřešeno' : item.dismissedAt ? 'Skryto' : item.readAt ? 'Přečteno' : 'Nepřečteno'
  return <article className={`reminder-card ${item.importance}${item.readAt ? ' read' : ' unread'}`} aria-label={`${item.title}, ${state}`}>
    <button className="reminder-open" onClick={onOpen}><span className="reminder-icon" aria-hidden="true">{sourceIcons[item.source]}</span><span className="reminder-copy"><span className="reminder-card-title">{item.title}</span>{item.description && <span className="reminder-description">{item.description}</span>}<span className="reminder-meta">{item.importance === 'important' ? 'Důležité · ' : ''}{item.source.replace('-', ' ')}</span></span>{!item.readAt && <span className="unread-dot"><span className="sr-only">Nepřečteno</span></span>}</button>
    <div className="reminder-actions">{!item.readAt && <button className="link" onClick={onRead}>Označit jako přečtené</button>}{!item.resolvedAt && !item.dismissedAt && canDismiss(item) && <button className="link" onClick={onDismiss}>Skrýt</button>}</div>
  </article>
}

function ReminderSettings({ preferences, reminders, saving, feedback, onChange }: { preferences: NotificationPreferences; reminders: ReminderRecord[]; saving: boolean; feedback: string | null; onChange: (next: NotificationPreferences) => Promise<void> }) {
  const digestKind = preferences.dailyDigestEnabled ? 'daily' : 'weekly'
  const digest = buildDigest(reminders, digestKind, new Date(), preferences.timezone)
  const toggle = (key: keyof NotificationPreferences, value: boolean) => onChange({ ...preferences, [key]: value })
  const detectedTimezone = browserTimezone()
  const supportedTimezones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC']
  const timezoneOptions = supportedTimezones.includes(preferences.timezone) ? supportedTimezones : [preferences.timezone, ...supportedTimezones]
  return <div className="reminder-settings">
    <section className="section"><h2>Doručování</h2><label className="setting-row"><span><strong>Připomínky v aplikaci</strong><small>Zobrazí zvonek, centrum a historii.</small></span><input type="checkbox" checked={preferences.inAppEnabled} onChange={(event) => toggle('inAppEnabled', event.target.checked)} disabled={saving} /></label><label className="setting-row"><span><strong>Tiché připomínky jen v aplikaci</strong><small>Push vynechá méně naléhavé položky.</small></span><input type="checkbox" checked={preferences.quietPushEnabled} onChange={(event) => toggle('quietPushEnabled', event.target.checked)} disabled={saving} /></label><PushSettings preferences={preferences} saving={saving} onChange={onChange} /></section>
    <section className="section"><h2>Souhrny</h2><p className="row-meta">Přehled se vždy zobrazí v Reminder Center. Když máte zapnutý push a registrované zařízení, server ho doručí i při zavřené aplikaci.</p><label className="setting-row"><span><strong>Denní přehled</strong><small>Krátký přehled dneška a zítřka.</small></span><input type="checkbox" checked={preferences.dailyDigestEnabled} onChange={(event) => onChange({ ...preferences, dailyDigestEnabled: event.target.checked, weeklyDigestEnabled: event.target.checked ? false : preferences.weeklyDigestEnabled })} disabled={saving} /></label><label className="setting-row"><span><strong>Týdenní přehled</strong><small>Výhled na příštích sedm dnů.</small></span><input type="checkbox" checked={preferences.weeklyDigestEnabled} onChange={(event) => onChange({ ...preferences, weeklyDigestEnabled: event.target.checked, dailyDigestEnabled: event.target.checked ? false : preferences.dailyDigestEnabled })} disabled={saving} /></label>{(preferences.dailyDigestEnabled || preferences.weeklyDigestEnabled) && <div className="digest-preview"><strong>Náhled přehledu</strong><span>{digest.items.length} aktivních · {digest.important} důležitých</span></div>}</section>
    <section className="section"><h2>Kategorie</h2><div className="category-settings">{REMINDER_CATEGORIES.map((category) => <label className="setting-row" key={category}><span>{categoryLabels[category]}</span><input type="checkbox" checked={preferences.categories[category]} onChange={(event) => onChange({ ...preferences, categories: { ...preferences.categories, [category]: event.target.checked } })} disabled={saving} /></label>)}</div></section>
    <section className="section"><h2>Čas a klidné hodiny</h2><label className="setting-row"><span><strong>Časové pásmo automaticky</strong><small>Podle tohoto zařízení: {detectedTimezone}</small></span><input type="checkbox" checked={preferences.timezoneMode === 'auto'} onChange={(event) => onChange({ ...preferences, timezoneMode: event.target.checked ? 'auto' : 'explicit', timezone: event.target.checked ? detectedTimezone : preferences.timezone })} disabled={saving} /></label>{preferences.timezoneMode === 'explicit' && <label className="setting-row"><span><strong>Vlastní časové pásmo</strong><small>Volba zůstane zachovaná i na jiném zařízení.</small></span><select value={preferences.timezone} onChange={(event) => onChange({ ...preferences, timezone: event.target.value })} disabled={saving}>{timezoneOptions.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}</select></label>}<label className="setting-row"><span><strong>Odložit budoucí doručení</strong><small>Server respektuje tento interval při plánování; Reminder Center zůstává dostupné.</small></span><input type="checkbox" checked={preferences.quietHoursEnabled} onChange={(event) => toggle('quietHoursEnabled', event.target.checked)} disabled={saving} /></label>{preferences.quietHoursEnabled && <div className="quiet-hours"><label>Od <input type="time" value={preferences.quietHoursStart} onChange={(event) => onChange({ ...preferences, quietHoursStart: event.target.value })} /></label><label>Do <input type="time" value={preferences.quietHoursEnd} onChange={(event) => onChange({ ...preferences, quietHoursEnd: event.target.value })} /></label></div>}<p className="row-meta">Používané časové pásmo: {preferences.timezone}</p></section>
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
    insecure: 'Oznámení vyžadují zabezpečené HTTPS připojení.',
    'service-worker-unavailable': 'Tento prohlížeč nepodporuje práci aplikace na pozadí.',
    'notifications-unavailable': 'Tento prohlížeč nepodporuje systémová oznámení.',
    'push-unavailable': 'Web Push není v tomto prohlížeči dostupný.',
    'missing-vapid-key': 'Push zatím není nakonfigurovaný pro toto prostředí.',
    blocked: 'Oznámení jsou zablokovaná. Povolte je v nastavení prohlížeče nebo systému.',
  }

  async function enable() {
    setMessage(null)
    try {
      await push.enableCurrentDevice()
      if (!preferences.pushEnabled) await onChange({ ...preferences, pushEnabled: true })
      setShowIntro(false)
      setMessage('Testovací zařízení je zaregistrované. Můžete poslat test.')
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Push se nepodařilo zapnout.') }
  }

  async function disableCurrent() {
    setMessage(null)
    try { await push.disableCurrentDevice(); setMessage('Push byl na tomto zařízení vypnutý.') }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Zařízení se nepodařilo odebrat.') }
  }

  async function disableAccount() {
    try { await onChange({ ...preferences, pushEnabled: false }); setMessage('Push je vypnutý pro celý účet. Zařízení zůstávají uložená pro snadné opětovné zapnutí.') }
    catch { /* Parent settings feedback already contains the error. */ }
  }

  async function test() {
    setMessage('Odesílám test skutečnou push cestou…')
    try { await push.sendTest(); setMessage('Test byl předán push službě. Oznámení by mělo dorazit během chvilky.') }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Test se nepodařilo odeslat.') }
  }

  return <div className="push-settings">
    <div className="setting-row push-summary"><span><strong>Push oznámení</strong><small>{preferences.pushEnabled ? `Zapnutá pro účet${otherDevices ? ` · další zařízení: ${otherDevices}` : ''}` : 'Vypnutá pro účet'} · toto zařízení: {push.currentDevice ? 'registrované' : push.browserSubscribed ? 'čeká na synchronizaci' : 'neregistrované'}</small></span><span className={`status-pill ${preferences.pushEnabled ? 'active' : ''}`}>{preferences.pushEnabled ? 'Zapnuto' : 'Vypnuto'}</span></div>
    {push.capability.code === 'ios-install-required' ? <div className="push-guidance"><strong>Na iPhonu nebo iPadu nejprve přidejte Rodinku na plochu</strong><ol><li>Otevřete nabídku Sdílet.</li><li>Zvolte Přidat na plochu.</li><li>Spusťte Rodinku z nové ikony.</li><li>V Rodince zapněte oznámení.</li></ol></div>
      : push.capability.code !== 'supported' ? <p className="row-meta push-warning">{stateCopy[push.capability.code]}</p>
        : !push.currentDevice ? <button type="button" className="btn-secondary" disabled={push.busy || push.loading || saving} onClick={() => setShowIntro(true)}>Zapnout na tomto zařízení</button>
          : <div className="push-actions"><button type="button" className="btn-secondary" disabled={push.busy || saving || !preferences.pushEnabled} onClick={test}>Poslat testovací oznámení</button><button type="button" className="link" disabled={push.busy} onClick={disableCurrent}>Vypnout na tomto zařízení</button></div>}
    {preferences.pushEnabled && <button type="button" className="link danger-link" disabled={push.busy || saving} onClick={disableAccount}>Vypnout push pro celý účet</button>}
    {showIntro && <div className="push-consent" role="dialog" aria-label="Zapnutí push oznámení"><strong>Chcete zapnout push na tomto zařízení?</strong><p>Rodinka pošle seskupené připomínky k rodinnému plánu. Text na zamčené obrazovce nebude obsahovat zdravotní poznámky, čísla dokumentů ani jiné citlivé podrobnosti. Povolení lze později změnit a každé zařízení se zapíná zvlášť.</p><div className="modal-actions"><button type="button" onClick={enable} disabled={push.busy}>Povolit oznámení</button><button type="button" className="btn-secondary" onClick={() => setShowIntro(false)} disabled={push.busy}>Teď ne</button></div></div>}
    {activeDevices.length > 0 && <div className="push-devices"><h3>Zařízení</h3>{activeDevices.map((device) => <div className="push-device" key={device.id}><span><strong>{device.deviceName || 'Webový prohlížeč'}{device.current ? ' · toto zařízení' : ''}</strong><small>Naposledy aktivní {new Date(device.lastSeenAt).toLocaleDateString('cs-CZ')}</small></span><button type="button" className="link" disabled={push.busy} onClick={() => push.revokeDevice(device.id).catch(() => undefined)}>Odebrat</button></div>)}</div>}
    {(message || push.error) && <p className="shopping-feedback" role="status">{message || push.error}</p>}
  </div>
}
