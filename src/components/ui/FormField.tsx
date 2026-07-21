import { useId, type ReactNode } from 'react'

export interface FieldControlProps {
  id: string
  'aria-describedby': string | undefined
  'aria-invalid': boolean | undefined
  'aria-required': boolean | undefined
}

interface FormFieldProps {
  label: ReactNode
  /** Guidance shown under the control and linked via aria-describedby. */
  hint?: ReactNode
  /** A validation or server error. When set, it is announced and linked too. */
  error?: string | null
  required?: boolean
  className?: string
  /**
   * Receives the id and aria wiring to spread onto the control. A render prop
   * rather than context so a field can never render its label without also
   * wiring its input — the association is not optional.
   */
  children: (control: FieldControlProps) => ReactNode
}

/**
 * One field: label, control, optional hint, optional error.
 *
 * Before this, forms hand-rolled `<label>text<input/></label>`, which gave no
 * stable id, no `aria-describedby` for the error, and left the error floating
 * elsewhere in the DOM. This wires all of that once: the label points at the
 * control by id, the hint and error are linked through aria-describedby, and
 * an error sets aria-invalid.
 */
export function FormField({ label, hint, error, required, className, children }: FormFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className={`form-field${required ? ' is-required' : ''}${error ? ' has-error' : ''}${className ? ` ${className}` : ''}`}>
      {/* The required marker is a CSS ::after, not DOM text, so the label's
          accessible name stays exactly the label — aria-required carries the
          requiredness to assistive tech. */}
      <label className="field-label" htmlFor={id}>{label}</label>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        'aria-required': required || undefined,
      })}
      {hint && !error && <p id={hintId} className="field-hint">{hint}</p>}
      {error && <p id={errorId} className="field-error" role="alert">{error}</p>}
    </div>
  )
}
