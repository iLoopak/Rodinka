import type { ReactNode } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Clock,
  Info,
  XCircle,
  type LucideIcon,
} from 'lucide-react'

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'pending'

const TONE_ICON: Record<StatusTone, LucideIcon> = {
  neutral: CircleDot,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  pending: Clock,
}

interface StatusPillProps {
  tone?: StatusTone
  /** The label. Required — a status is never conveyed by colour alone. */
  children: ReactNode
  /**
   * Override the tone's default glyph, or pass `null` to drop it. The icon is a
   * second, non-colour channel for the status, so removing it is deliberate.
   */
  icon?: LucideIcon | null
  className?: string
}

/**
 * The one status pill. `tone` picks the semantic colour AND a default glyph, so
 * the meaning survives when colour does not (colour-blind users, greyscale
 * print, a forced high-contrast theme). The text label is mandatory by type.
 *
 * Reuses the legacy `.status-pill` base shape and adds `--tone` modifiers, so it
 * consolidates the scattered `.badge-*` spellings onto one implementation
 * rather than introducing a parallel one.
 */
export function StatusPill({ tone = 'neutral', children, icon, className }: StatusPillProps) {
  const Icon = icon === null ? null : icon ?? TONE_ICON[tone]
  const classes = ['status-pill', `status-pill--${tone}`, className].filter(Boolean).join(' ')
  return (
    <span className={classes}>
      {Icon && <Icon className="status-pill__icon" size={13} strokeWidth={2.4} aria-hidden="true" />}
      <span className="status-pill__label">{children}</span>
    </span>
  )
}
