import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from 'react'
import { ChevronRight } from 'lucide-react'

interface ListRowSlots {
  /** Avatar, icon, checkbox — the left-hand identity or control. */
  leading?: ReactNode
  title?: ReactNode
  /** Secondary line beside the title (assignee, time, count). */
  meta?: ReactNode
  /** Full-width supporting line below the title. */
  description?: ReactNode
  /** Right-hand badges, amounts, or an action button. */
  trailing?: ReactNode
}

interface ListRowProps extends ListRowSlots, Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Dims the row and, via the wrappers, disables interaction. */
  disabled?: boolean
  /** Marks the row selected without relying on colour alone (see wrappers). */
  selected?: boolean
}

function RowContent({ leading, title, meta, description, trailing }: ListRowSlots) {
  return (
    <>
      {leading != null && <span className="list-row__leading">{leading}</span>}
      <span className="list-row__body">
        {(title != null || meta != null) && (
          <span className="list-row__heading">
            {title != null && <span className="list-row__title">{title}</span>}
            {meta != null && <span className="list-row__meta">{meta}</span>}
          </span>
        )}
        {description != null && <span className="list-row__description">{description}</span>}
      </span>
      {trailing != null && <span className="list-row__trailing">{trailing}</span>}
    </>
  )
}

function rowClasses(base: string[], { disabled, selected }: { disabled?: boolean; selected?: boolean }, className?: string) {
  return [...base, disabled ? 'is-disabled' : '', selected ? 'is-selected' : '', className]
    .filter(Boolean)
    .join(' ')
}

/**
 * The one row layout: five composition slots, no feature-specific boolean props.
 * Specialised behaviour (navigation, selection) belongs to the wrappers below,
 * so this stays a pure presentational shell shared across every list.
 *
 * This bare form is not interactive — use it for editable/summary rows that
 * carry their own inner controls in `trailing`. For a whole-row tap target use
 * `NavigationRow` or `SelectableRow`, which render real semantic elements.
 */
export function ListRow({ leading, title, meta, description, trailing, disabled, selected, className, ...rest }: ListRowProps) {
  return (
    <div className={rowClasses(['list-row'], { disabled, selected }, className)} {...rest}>
      <RowContent leading={leading} title={title} meta={meta} description={description} trailing={trailing} />
    </div>
  )
}

interface NavigationRowProps
  extends ListRowSlots,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'>,
    Pick<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  /** Renders an anchor instead of a button — navigation vs. in-app action. */
  href?: string
  /** Hide the trailing chevron (e.g. when the row supplies its own affordance). */
  showChevron?: boolean
}

/**
 * A row whose whole surface is the tap target. Renders a real `<button>` (or an
 * `<a>` when `href` is set), so it is keyboard-activatable and announced as a
 * control without any `role`/`tabIndex`/`onKeyDown` wiring. A trailing chevron
 * signals "goes somewhere".
 *
 * Do not put other interactive elements in the slots — a button inside a button
 * is invalid. Those rows want the bare `ListRow` with inline controls instead.
 */
export function NavigationRow({
  leading,
  title,
  meta,
  description,
  trailing,
  href,
  showChevron = true,
  className,
  disabled,
  ...rest
}: NavigationRowProps) {
  const chevron = showChevron ? <ChevronRight className="list-row__chevron" size={18} aria-hidden="true" /> : null
  const combinedTrailing =
    trailing != null || chevron ? (
      <>
        {trailing}
        {chevron}
      </>
    ) : undefined
  const content = (
    <RowContent leading={leading} title={title} meta={meta} description={description} trailing={combinedTrailing} />
  )
  const classes = rowClasses(['list-row', 'list-row--navigation'], { disabled }, className)

  if (href != null) {
    const { type: _type, ...anchorRest } = rest as ButtonHTMLAttributes<HTMLButtonElement>
    void _type
    return (
      <a
        className={classes}
        href={disabled ? undefined : href}
        aria-disabled={disabled || undefined}
        {...(anchorRest as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {content}
      </a>
    )
  }
  return (
    <button type="button" className={classes} disabled={disabled} {...rest}>
      {content}
    </button>
  )
}

interface SelectableRowProps extends ListRowSlots, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  selected: boolean
}

/**
 * A row that toggles a selection. Renders a `<button>` carrying `aria-pressed`,
 * so the selected state reaches assistive tech and is not signalled by colour
 * alone. Keyboard activation is native to the button.
 */
export function SelectableRow({
  leading,
  title,
  meta,
  description,
  trailing,
  selected,
  className,
  disabled,
  ...rest
}: SelectableRowProps) {
  return (
    <button
      type="button"
      className={rowClasses(['list-row', 'list-row--selectable'], { disabled, selected }, className)}
      aria-pressed={selected}
      disabled={disabled}
      {...rest}
    >
      <RowContent leading={leading} title={title} meta={meta} description={description} trailing={trailing} />
    </button>
  )
}
