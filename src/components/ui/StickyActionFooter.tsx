import type { ReactNode } from 'react'
import { Button, type ButtonVariant } from './Button'

interface StickyActionFooterProps {
  /** Label for the confirming action. */
  submitLabel: ReactNode
  onSubmit?: () => void
  /** Omit for a plain button; set for a form's implicit submit. */
  submitType?: 'submit' | 'button'
  submitVariant?: ButtonVariant
  cancelLabel?: ReactNode
  onCancel?: () => void
  loading?: boolean
  submitDisabled?: boolean
  /** A tertiary destructive action (e.g. Delete), kept visually apart. */
  destructive?: { label: ReactNode; onClick: () => void }
  className?: string
}

/**
 * The action bar that sticks to the bottom of a modal or form.
 *
 * Consolidates the four spellings the audit found (`modal-actions`,
 * `form-actions`, `activity-form-footer`, ad-hoc). Its two jobs beyond
 * tidiness: it reserves safe-area space at the bottom so the confirm button
 * clears the iOS home indicator, and the scroll container it sits in gets
 * matching bottom padding so the footer never covers the last field.
 *
 * The keyboard case (the footer must not hide behind the on-screen keyboard)
 * is handled by the sheet's layout contract, not here — see the CSS.
 */
export function StickyActionFooter({
  submitLabel,
  onSubmit,
  submitType = 'button',
  submitVariant = 'primary',
  cancelLabel,
  onCancel,
  loading = false,
  submitDisabled = false,
  destructive,
  className,
}: StickyActionFooterProps) {
  return (
    <div className={`sticky-action-footer${className ? ` ${className}` : ''}`}>
      {destructive && (
        <Button variant="destructive" className="sticky-action-destructive" onClick={destructive.onClick} disabled={loading}>
          {destructive.label}
        </Button>
      )}
      <div className="sticky-action-primary-group">
        {cancelLabel && (
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
        )}
        <Button variant={submitVariant} type={submitType} onClick={onSubmit} loading={loading} disabled={submitDisabled}>
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}
