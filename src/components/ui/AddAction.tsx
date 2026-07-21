import type { ReactNode } from 'react'
import { Button, IconButton } from './Button'
import { t } from '../../strings'

interface AddButtonProps {
  onClick: () => void
  /** Defaults to the generic "Přidat"/"Add"; pass a specific label ("Přidat úkol") where it helps. */
  children?: ReactNode
  className?: string
  disabled?: boolean
}

/**
 * The one "create a new record" action for a whole screen — Calendar, Tasks,
 * Shopping, Planner, an empty state's first record. Always filled/primary
 * with a leading "+", never a pill, outline, or text link: those were the
 * "red square" / "round FAB" / "+ Add" / plain link spellings the app-wide
 * add-action audit found and this component replaces.
 */
export function AppPrimaryAddButton({ children, ...rest }: AddButtonProps) {
  return <Button variant="primary" leadingIcon="+" {...rest}>{children ?? t.create.addAction}</Button>
}

/**
 * The create action for a section header inside a bigger screen — a
 * ScreenHeader's actions slot, or a sub-section heading like "Plan for
 * <member>". Same appearance as AppPrimaryAddButton by design (one look for
 * "how do I create something here"); kept as its own name so header call
 * sites read as header actions, not screen-level CTAs.
 */
export function AppToolbarAddButton({ children, ...rest }: AddButtonProps) {
  return <Button variant="primary" leadingIcon="+" {...rest}>{children ?? t.create.addAction}</Button>
}

interface AddActionIconProps {
  onClick: () => void
  /** Required: an icon-only control has no visible text to name it. */
  'aria-label': string
  className?: string
  disabled?: boolean
}

/** Icon-only create action for a header too tight for a label (Calendar). */
export function AddActionIcon(props: AddActionIconProps) {
  return <IconButton variant="primary" {...props}>+</IconButton>
}
