import { useCallback, useState } from 'react'
import { t } from '../../strings'
import { usePush } from '../../context/PushContext'
import { useReminders } from '../../context/ReminderContext'

const DISMISS_KEY = 'rodinka.messagePushPrompt.dismissed'

/**
 * Contextual permission ask.
 *
 * Rodinka never calls `Notification.requestPermission()` on first load — a
 * cold prompt gets denied, and a denial is close to permanent because the
 * user has to dig into browser settings to undo it. Instead this appears
 * once the feature has visibly earned it: the user has actually received a
 * message from someone else in the family.
 *
 * The system dialog is still one further click away, behind the explainer
 * in `PushSettings`-style copy: what will arrive, and that it can be
 * changed later.
 */
export function MessagePushPrompt({ hasReceivedMessage }: { hasReceivedMessage: boolean }) {
  const push = usePush()
  const { preferences, savePreferences } = useReminders()
  const [dismissed, setDismissed] = useState(() => {
    try { return window.localStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
  })
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dismiss = useCallback(() => {
    setDismissed(true)
    try { window.localStorage.setItem(DISMISS_KEY, '1') } catch { /* private mode: prompt returns next session */ }
  }, [])

  const enable = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await push.enableCurrentDevice()
      if (!preferences.pushEnabled) await savePreferences({ ...preferences, pushEnabled: true })
      dismiss()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.errors.generic)
    } finally {
      setBusy(false)
    }
  }, [push, preferences, savePreferences, dismiss])

  // Only ask where asking can succeed and where it is not redundant:
  // a granted/denied permission, an unsupported browser, an uninstalled iOS
  // PWA and an already-registered device all skip this entirely.
  if (dismissed || !hasReceivedMessage) return null
  if (push.loading || push.busy) return null
  if (push.capability.code !== 'supported') return null
  if (push.capability.permission !== 'default') return null
  if (push.currentDevice) return null

  return (
    <div className="messages-push-prompt" role="region" aria-label={t.reminders.consentLabel}>
      {!expanded ? (
        <>
          <span className="messages-push-prompt-text">{t.messages.pushPromptTitle}</span>
          <div className="messages-push-prompt-actions">
            <button type="button" className="btn-secondary" onClick={() => setExpanded(true)}>
              {t.messages.pushPromptEnable}
            </button>
            <button type="button" className="link" onClick={dismiss}>{t.reminders.notNow}</button>
          </div>
        </>
      ) : (
        <section className="push-consent" aria-labelledby="messages-push-consent-title">
          <strong id="messages-push-consent-title">{t.reminders.consentTitle}</strong>
          <p>{t.reminders.consentBody}</p>
          <div className="modal-actions">
            <button type="button" onClick={() => void enable()} disabled={busy}>{t.reminders.allow}</button>
            <button type="button" className="btn-secondary" onClick={dismiss} disabled={busy}>{t.reminders.notNow}</button>
          </div>
          {error && <p className="shopping-feedback" role="alert">{error}</p>}
        </section>
      )}
    </div>
  )
}
