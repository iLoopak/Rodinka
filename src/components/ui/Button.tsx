import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /** Shows a spinner and disables the button without collapsing its width. */
  loading?: boolean
  /** Leading glyph or icon; kept aria-hidden since the label carries meaning. */
  leadingIcon?: ReactNode
  children: ReactNode
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  // The appearance vocabulary, one class per variant. The audit found several
  // different spellings of a secondary action in use across screens; this is
  // now the single source of that decision. Layout — where the button sits and
  // how big it is — is the container's job, not the variant's.
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  destructive: 'btn-danger',
}

/**
 * The one way to write a button. `variant` chooses appearance; placement and
 * sizing come from wherever the button lives (a screen toolbar, a form footer),
 * which is what keeps a look change from moving a layout.
 */
export function Button({
  variant = 'primary',
  loading = false,
  leadingIcon,
  children,
  className,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = ['btn', VARIANT_CLASS[variant], loading ? 'is-loading' : '', className]
    .filter(Boolean)
    .join(' ')
  return (
    <button type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <span className="btn-spinner" aria-hidden="true" />}
      {leadingIcon && <span className="btn-leading-icon" aria-hidden="true">{leadingIcon}</span>}
      {children}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /** Required: an icon-only control has no visible text to name it. */
  'aria-label': string
  children: ReactNode
}

/**
 * Icon-only button. The label is required by the type, not just encouraged,
 * because there is no text for a screen reader to fall back on.
 */
export function IconButton({
  variant = 'ghost',
  children,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  const classes = ['btn', 'btn-icon', VARIANT_CLASS[variant], className].filter(Boolean).join(' ')
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  )
}
