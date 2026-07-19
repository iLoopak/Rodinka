import { useState } from 'react'
import { t } from '../strings'
import { FamilyMark } from './FamilyMark'

interface Props {
  canOpenShopping: boolean
  canOpenCalendar: boolean
  deviceOffline: boolean
  onOpenShopping: () => void
  onOpenCalendar: () => void
  onRetry: () => void | Promise<void>
}

export function OfflineFallbackScreen({ canOpenShopping, canOpenCalendar, deviceOffline, onOpenShopping, onOpenCalendar, onRetry }: Props) {
  const [retrying, setRetrying] = useState(false)

  async function retry() {
    if (retrying) return
    setRetrying(true)
    try { await onRetry() } finally { setRetrying(false) }
  }

  return (
    <main className="offline-state app-loading" aria-labelledby="offline-title">
      <FamilyMark variant="static" size={42} />
      <section className="offline-card">
        <p className="eyebrow">{t.offline.statusLabel}</p>
        <h1 id="offline-title">{t.offline.title}</h1>
        <p>{deviceOffline ? t.offline.deviceOfflineBody : t.offline.body}</p>
        {!canOpenShopping && !canOpenCalendar && <p className="form-hint">{t.offline.noLocalData}</p>}
        <div className="form-actions">
          <button type="button" onClick={onOpenShopping} disabled={!canOpenShopping}>{t.offline.openShopping}</button>
          <button type="button" onClick={onOpenCalendar} disabled={!canOpenCalendar}>{t.offline.openCalendar}</button>
          <button type="button" className="btn-secondary" disabled={retrying} onClick={() => void retry()}>{retrying ? t.errors.retrying : t.offline.retry}</button>
        </div>
      </section>
    </main>
  )
}
