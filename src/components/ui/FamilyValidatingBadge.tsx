import { t } from '../../strings'
import { useFamilyIdentityValidating } from '../../context/family/FamilyBootstrapContext'

// Shown only while the shell is running on a cached family identity and the
// server has not confirmed it yet. Deliberately the same quiet dot+label as
// the realtime badge: the app is usable, but it must not pretend the data is
// already reconciled. It disappears on its own the moment the server answers.
export function FamilyValidatingBadge() {
  const validating = useFamilyIdentityValidating()
  if (!validating) return null

  return (
    <span
      className="realtime-status-badge validating"
      role="status"
      aria-live="polite"
      aria-label={t.bootstrap.validatingAria}
    >
      <span className="realtime-status-dot" aria-hidden="true" />
      <span>{t.bootstrap.validating}</span>
    </span>
  )
}
