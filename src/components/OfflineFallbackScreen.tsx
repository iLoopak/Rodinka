import { t } from '../strings'
import { FamilyMark } from './FamilyMark'

interface Props {
  canOpenShopping: boolean
  deviceOffline: boolean
  onOpenShopping: () => void
  onRetry: () => void
}

export function OfflineFallbackScreen({ canOpenShopping, deviceOffline, onOpenShopping, onRetry }: Props) {
  return (
    <main className="offline-state app-loading" aria-labelledby="offline-title">
      <FamilyMark variant="static" size={42} />
      <section className="offline-card">
        <p className="eyebrow">Offline</p>
        <h1 id="offline-title">{t.offline.title}</h1>
        <p>{deviceOffline ? t.offline.deviceOfflineBody : t.offline.body}</p>
        {!canOpenShopping && <p className="form-hint">{t.offline.noLocalData}</p>}
        <div className="form-actions">
          <button type="button" onClick={onOpenShopping} disabled={!canOpenShopping}>{t.offline.openShopping}</button>
          <button type="button" className="btn-secondary" onClick={onRetry}>{t.offline.retry}</button>
        </div>
      </section>
    </main>
  )
}
