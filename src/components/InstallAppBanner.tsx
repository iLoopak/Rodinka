import { useState } from 'react'
import { t } from '../strings'
import { useInstallPrompt } from '../hooks/useInstallPrompt'

const DISMISS_KEY = 'rodinka-install-banner-dismissed'

// Browser-only prompt to add Rodinka to the home screen. Renders nothing
// once installed, on iOS/Android browsers that can't offer it, or inside
// a future Capacitor-wrapped app (see useInstallPrompt for how that last
// case stays automatic).
export function InstallAppBanner() {
  const { canPrompt, showIOSInstructions, promptInstall } = useInstallPrompt()
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  if (dismissed || (!canPrompt && !showIOSInstructions)) {
    return null
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // Storage can be unavailable (private browsing, disabled cookies) —
      // dismissing just won't persist across reloads, not worth failing over.
    }
    setDismissed(true)
  }

  async function handleInstall() {
    await promptInstall()
    dismiss()
  }

  return (
    <div className="install-banner">
      <div className="install-banner-text">
        <p className="install-banner-title">{canPrompt ? t.install.bannerTitle : t.install.iosTitle}</p>
        <p className="install-banner-body">{canPrompt ? t.install.bannerBody : t.install.iosBody}</p>
      </div>
      <div className="install-banner-actions">
        {canPrompt && (
          <button type="button" onClick={handleInstall}>
            {t.install.installAction}
          </button>
        )}
        <button type="button" className="modal-close" onClick={dismiss} aria-label={t.install.dismiss}>
          ×
        </button>
      </div>
    </div>
  )
}
