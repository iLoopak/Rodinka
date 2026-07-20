import { useState } from 'react'
import { applyServiceWorkerUpdate, useServiceWorkerUpdateReady } from '../push/serviceWorkerUpdates'
import { t } from '../strings'

/**
 * Offers the newer build rather than installing it silently. Reloading without
 * asking would discard whatever the user was typing; unsent offline changes
 * are safe either way, since both mutation queues live in IndexedDB.
 */
export function ServiceWorkerUpdateBanner() {
  const updateReady = useServiceWorkerUpdateReady()
  const [applying, setApplying] = useState(false)
  if (!updateReady) return null

  return (
    <div className="app-update-banner" role="status">
      <span>{t.appUpdate.available}</span>
      <button
        type="button"
        className="link"
        disabled={applying}
        onClick={() => { setApplying(true); applyServiceWorkerUpdate() }}
      >{applying ? t.appUpdate.applying : t.appUpdate.action}</button>
    </div>
  )
}
