import { useMemo, useState } from 'react'
import { useReminders } from '../../context/ReminderContext'
import { useRouter } from '../../router'
import { buildDigest, reminderSection, type ReminderSection } from '../../notifications/reminderPresentation'
import { REMINDER_CATEGORIES, type NotificationPreferences, type ReminderRecord } from '../../notifications/reminders'

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
    catch (caught) { setFeedback(caught instanceof Error ? caught.message : 'Nastavení se nepodařilo uložit.') }
    finally { setSaving(false) }
  }

  if (loading) return <p className="loading">Načítám připomínky…</p>

  const tabs: { id: Tab; label: string }[] = [{ id: 'active', label: `Aktivní${unreadCount ? ` (${unreadCount})` : ''}` }, { id: 'history', label: 'Historie' }, { id: 'settings', label: 'Nastavení' }]
  return <>
    <div className="screen-header reminder-center-header"><div><h1 className="home-title" tabIndex={-1}>Připomínky</h1><p className="home-subtitle">Co je dobré zařídit, pohromadě a bez zbytečného hluku.</p></div>{tab === 'active' && unreadCount > 0 && <button className="btn-secondary" onClick={() => markAllRead()}>Přečíst vše</button>}</div>
    <div className="tabs" role="tablist">{tabs.map((item) => <button key={item.id} className={`tab-button${tab === item.id ? ' active' : ''}`} role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {tab === 'active' && (active.length === 0 ? <div className="reminder-empty"><span aria-hidden="true">✓</span><h2>Máte všechno hotovo</h2><p>Nové připomínky se tu objeví, až bude potřeba něco zařídit.</p><button className="link" onClick={() => setTab('settings')}>Nastavení připomínek</button></div> : <div className="reminder-sections">{(['overdue', 'today', 'upcoming', 'earlier'] as ReminderSection[]).map((section) => {
      const items = sections.get(section); if (!items?.length) return null
      return <section key={section} className="reminder-section"><h2>{sectionLabels[section]} <span>{items.length}</span></h2><div className="reminder-list">{items.map((item) => <ReminderCard key={item.id} item={item} onOpen={() => open(item)} onRead={() => markRead(item.id)} onDismiss={() => dismiss(item.id)} />)}</div></section>
    })}</div>)}
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

function ReminderSettings({ preferences, reminders, saving, feedback, onChange }: { preferences: NotificationPreferences; reminders: ReminderRecord[]; saving: boolean; feedback: string | null; onChange: (next: NotificationPreferences) => void }) {
  const digestKind = preferences.dailyDigestEnabled ? 'daily' : 'weekly'
  const digest = buildDigest(reminders, digestKind, new Date(), preferences.timezone)
  const toggle = (key: keyof NotificationPreferences, value: boolean) => onChange({ ...preferences, [key]: value })
  return <div className="reminder-settings">
    <section className="section"><h2>Doručování</h2><label className="setting-row"><span><strong>Připomínky v aplikaci</strong><small>Zobrazí zvonek, centrum a historii.</small></span><input type="checkbox" checked={preferences.inAppEnabled} onChange={(event) => toggle('inAppEnabled', event.target.checked)} disabled={saving} /></label><label className="setting-row"><span><strong>Tiché připomínky jen v aplikaci</strong><small>Budoucí push doručení vynechá méně naléhavé položky.</small></span><input type="checkbox" checked={preferences.quietPushEnabled} onChange={(event) => toggle('quietPushEnabled', event.target.checked)} disabled={saving} /></label><label className="setting-row disabled"><span><strong>Push oznámení</strong><small>Vyžaduje serverové doručování; zatím není v produkci dostupné.</small></span><input type="checkbox" checked={false} disabled /></label></section>
    <section className="section"><h2>Souhrny</h2><label className="setting-row"><span><strong>Denní souhrn</strong><small>Krátký přehled dneška a zítřka.</small></span><input type="checkbox" checked={preferences.dailyDigestEnabled} onChange={(event) => onChange({ ...preferences, dailyDigestEnabled: event.target.checked, weeklyDigestEnabled: event.target.checked ? false : preferences.weeklyDigestEnabled })} disabled={saving} /></label><label className="setting-row"><span><strong>Týdenní souhrn</strong><small>Výhled na příštích sedm dní.</small></span><input type="checkbox" checked={preferences.weeklyDigestEnabled} onChange={(event) => onChange({ ...preferences, weeklyDigestEnabled: event.target.checked, dailyDigestEnabled: event.target.checked ? false : preferences.dailyDigestEnabled })} disabled={saving} /></label>{(preferences.dailyDigestEnabled || preferences.weeklyDigestEnabled) && <div className="digest-preview"><strong>Náhled souhrnu</strong><span>{digest.items.length} aktivních · {digest.important} důležitých</span></div>}</section>
    <section className="section"><h2>Kategorie</h2><div className="category-settings">{REMINDER_CATEGORIES.map((category) => <label className="setting-row" key={category}><span>{categoryLabels[category]}</span><input type="checkbox" checked={preferences.categories[category]} onChange={(event) => onChange({ ...preferences, categories: { ...preferences.categories, [category]: event.target.checked } })} disabled={saving} /></label>)}</div></section>
    <section className="section"><h2>Klidné hodiny</h2><label className="setting-row"><span><strong>Odložit budoucí doručení</strong><small>Platí pro digest a případný push; centrum zůstává dostupné.</small></span><input type="checkbox" checked={preferences.quietHoursEnabled} onChange={(event) => toggle('quietHoursEnabled', event.target.checked)} disabled={saving} /></label>{preferences.quietHoursEnabled && <div className="quiet-hours"><label>Od <input type="time" value={preferences.quietHoursStart} onChange={(event) => onChange({ ...preferences, quietHoursStart: event.target.value })} /></label><label>Do <input type="time" value={preferences.quietHoursEnd} onChange={(event) => onChange({ ...preferences, quietHoursEnd: event.target.value })} /></label></div>}<p className="row-meta">Časové pásmo: {preferences.timezone}</p></section>
    {feedback && <p className="shopping-feedback" role="status">{feedback}</p>}
  </div>
}
