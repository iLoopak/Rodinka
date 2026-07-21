import { useState, type ReactNode } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  CloudOff,
  Inbox,
  Loader2,
  Lock,
  SearchX,
  type LucideIcon,
} from 'lucide-react'
import { t } from '../../strings'
import { Button } from './Button'

export type StateVariant =
  | 'loading'
  | 'skeleton'
  | 'empty'
  | 'noResults'
  | 'error'
  | 'offline'
  | 'degraded'
  | 'permissionDenied'
  | 'endOfList'

type StateTone = 'neutral' | 'danger' | 'warning' | 'info'

interface VariantConfig {
  icon: LucideIcon | null
  tone: StateTone
  /** `alert` interrupts; `status` announces politely. Chosen per severity. */
  live: 'alert' | 'status'
}

// One table so the *differences* between states are visible in one place — the
// whole point of the wave is that offline, degraded and permission-denied do
// not collapse into a single generic error. Different icon, tone and copy each.
const VARIANTS: Record<StateVariant, VariantConfig> = {
  loading: { icon: Loader2, tone: 'neutral', live: 'status' },
  skeleton: { icon: null, tone: 'neutral', live: 'status' },
  empty: { icon: Inbox, tone: 'neutral', live: 'status' },
  noResults: { icon: SearchX, tone: 'neutral', live: 'status' },
  error: { icon: AlertCircle, tone: 'danger', live: 'alert' },
  offline: { icon: CloudOff, tone: 'info', live: 'status' },
  degraded: { icon: AlertTriangle, tone: 'warning', live: 'status' },
  permissionDenied: { icon: Lock, tone: 'danger', live: 'status' },
  endOfList: { icon: null, tone: 'neutral', live: 'status' },
}

interface StateAction {
  label: string
  onClick: () => void | Promise<void>
  variant?: 'primary' | 'secondary'
}

interface StateViewProps {
  variant: StateVariant
  /** Falls back to the variant's default title from the shared vocabulary. */
  title?: ReactNode
  /** The explanation — why the user is seeing this and what it means. */
  description?: ReactNode
  /** Primary action (Retry, Reconnect, Go back). Awaited; guards double-tap. */
  action?: StateAction
  /**
   * Raw error text for developers. Rendered only in dev builds, never shipped to
   * users — the audit asked for a technical detail that stays out of production.
   */
  technicalDetail?: string
  children?: ReactNode
  className?: string
}

/**
 * The one vocabulary for non-content states. `variant` selects the icon, tone,
 * live-region politeness and default copy, so an offline screen can never
 * accidentally look like a permission error — the whole reason this exists.
 *
 * Every state gets a title, an explanation, an optional action and an optional
 * dev-only technical detail, in that fixed order.
 */
export function StateView({ variant, title, description, action, technicalDetail, children, className }: StateViewProps) {
  const config = VARIANTS[variant]
  const defaults = t.states[variant]
  const [busy, setBusy] = useState(false)

  async function runAction() {
    if (!action || busy) return
    setBusy(true)
    try {
      await action.onClick()
    } finally {
      setBusy(false)
    }
  }

  if (variant === 'skeleton') {
    return (
      <div className={['state-view', 'state-view--skeleton', className].filter(Boolean).join(' ')} role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">{title ?? defaults.title}</span>
        {children ?? (
          <>
            <span className="state-skeleton-line" />
            <span className="state-skeleton-line" />
            <span className="state-skeleton-line is-short" />
          </>
        )}
      </div>
    )
  }

  const Icon = config.icon
  const resolvedTitle = title ?? defaults.title
  const resolvedDescription = description ?? ('body' in defaults ? defaults.body : undefined)

  return (
    <div
      className={['state-view', `state-view--${variant}`, `state-view--tone-${config.tone}`, className].filter(Boolean).join(' ')}
      role={config.live}
      aria-live={config.live === 'alert' ? 'assertive' : 'polite'}
      aria-busy={variant === 'loading' || undefined}
    >
      {Icon && (
        <Icon
          className={`state-view__icon${variant === 'loading' ? ' state-view__icon--spin' : ''}`}
          size={variant === 'endOfList' ? 16 : 28}
          strokeWidth={2}
          aria-hidden="true"
        />
      )}
      {resolvedTitle != null && <p className="state-view__title">{resolvedTitle}</p>}
      {resolvedDescription != null && <p className="state-view__description">{resolvedDescription}</p>}
      {children}
      {action && (
        <Button
          variant={action.variant ?? 'secondary'}
          loading={busy}
          onClick={() => void runAction()}
        >
          {action.label}
        </Button>
      )}
      {import.meta.env.DEV && technicalDetail && (
        <pre className="state-view__technical" aria-hidden="true">{technicalDetail}</pre>
      )}
    </div>
  )
}
