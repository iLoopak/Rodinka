import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'

export type CardVariant = 'standard' | 'interactive' | 'selected' | 'muted' | 'warning' | 'danger'

const VARIANT_CLASS: Record<CardVariant, string> = {
  standard: 'card--standard',
  interactive: 'card--interactive',
  selected: 'card--selected',
  muted: 'card--muted',
  warning: 'card--warning',
  danger: 'card--danger',
}

interface CardBaseProps {
  variant?: CardVariant
  /**
   * A member accent applied on purpose (a member's own card), never as a blanket
   * status device. Sets the accent CSS var the card's rules read from.
   */
  accentColor?: string
  children: ReactNode
  className?: string
}

type CardProps = CardBaseProps & Omit<HTMLAttributes<HTMLDivElement>, 'color' | 'className' | 'children'>

/**
 * A surface for a self-contained block of content. Variants carry meaning
 * (`selected`, `warning`, `danger`) or affordance (`interactive`) — the audit
 * asked us to stop using a left colour stripe as the universal status hack, so
 * status lives in the variant, not an ad-hoc border.
 *
 * For a whole-card tap target use `InteractiveCard`, which renders a real
 * button; this `div` form is for static or partially-interactive content.
 */
export function Card({ variant = 'standard', accentColor, children, className, style, ...rest }: CardProps) {
  const classes = ['card', VARIANT_CLASS[variant], className].filter(Boolean).join(' ')
  const mergedStyle = accentColor
    ? { ...style, ['--card-accent' as string]: accentColor }
    : style
  return (
    <div className={classes} style={mergedStyle} {...rest}>
      {children}
    </div>
  )
}

interface InteractiveCardProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean
  accentColor?: string
  children: ReactNode
}

/**
 * A card that is itself the tap target. Renders a `<button>` so it is keyboard
 * operable and announced as a control for free — no `role`/`tabIndex`/`onKeyDown`
 * hand-wiring. `selected` sets `aria-pressed` so the state is not colour-only.
 */
export function InteractiveCard({
  selected,
  accentColor,
  children,
  className,
  style,
  type = 'button',
  ...rest
}: InteractiveCardProps) {
  const classes = ['card', 'card--interactive', selected ? 'card--selected' : '', className]
    .filter(Boolean)
    .join(' ')
  const mergedStyle = accentColor
    ? { ...style, ['--card-accent' as string]: accentColor }
    : style
  return (
    <button type={type} className={classes} style={mergedStyle} aria-pressed={selected} {...rest}>
      {children}
    </button>
  )
}
