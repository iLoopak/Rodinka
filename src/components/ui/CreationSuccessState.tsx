import { CheckCircle2 } from 'lucide-react'
import { t } from '../../strings'

interface Props {
  title: string
  body?: string
  doneLabel?: string
  onDone: () => void
}

/**
 * Replaces a create-flow form inside the same modal shell once the record
 * has actually been saved — no toast, no auto-close. Deliberately minimal:
 * one icon, one heading, at most one line of context, one button. The
 * `autofocus` attribute (not React's `autoFocus` prop, which never leaves a
 * queryable DOM attribute behind) is what lets `Modal`'s own focus effect
 * land on this button instead of the modal's close button — see
 * `src/components/ui/Modal.tsx`.
 */
export function CreationSuccessState({ title, body, doneLabel, onDone }: Props) {
  return (
    <div className="creation-success-state">
      <CheckCircle2 className="creation-success-icon" size={64} strokeWidth={1.5} aria-hidden="true" />
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      <button type="button" ref={(el) => el?.setAttribute('autofocus', '')} onClick={onDone}>
        {doneLabel ?? t.create.doneAction}
      </button>
    </div>
  )
}
