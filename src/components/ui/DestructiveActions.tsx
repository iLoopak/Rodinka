import { useEffect, useId, useState, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { t } from '../../strings'
import { Modal } from './Modal'

interface DestructiveIconButtonProps {
  label: string
  title?: string
  disabled?: boolean
  onClick: () => void
}

export function DestructiveIconButton({ label, title = label, disabled, onClick }: DestructiveIconButtonProps) {
  return (
    <button
      type="button"
      className="destructive-icon-button"
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      <Trash2 size={18} strokeWidth={2.4} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </button>
  )
}

interface ConfirmDestructiveActionDialogProps {
  open: boolean
  title: string
  explanation: ReactNode
  objectName?: string
  consequences?: string[]
  confirmLabel: string
  cancelLabel?: string
  busy?: boolean
  error?: string | null
  onCancel: () => void
  onConfirm: () => void | Promise<void>
}

export function ConfirmDestructiveActionDialog({
  open,
  title,
  explanation,
  objectName,
  consequences = [],
  confirmLabel,
  cancelLabel,
  busy = false,
  error,
  onCancel,
  onConfirm,
}: ConfirmDestructiveActionDialogProps) {
  const descriptionId = useId()
  if (!open) return null
  return (
    <Modal title={title} onClose={() => { if (!busy) onCancel() }} closeOnBackdrop={!busy} className="destructive-dialog">
      <div className="destructive-dialog-body" id={descriptionId}>
        {objectName && <p className="destructive-object-name">{objectName}</p>}
        <div>{explanation}</div>
        {consequences.length > 0 && <ul className="destructive-consequences">
          {consequences.map((item) => <li key={item}>{item}</li>)}
        </ul>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
      <div className="modal-footer destructive-dialog-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>{cancelLabel ?? t.destructive.cancel}</button>
        <button type="button" className="danger-action destructive-confirm-button" onClick={onConfirm} disabled={busy} autoFocus>
          {busy ? t.destructive.working : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

export type RecurringDeleteScope = 'single' | 'following' | 'series'

interface RecurringDeleteScopeDialogProps {
  open: boolean
  title: string
  explanation: ReactNode
  onCancel: () => void
  onSelect: (scope: RecurringDeleteScope) => void
}

export function RecurringDeleteScopeDialog({ open, title, explanation, onCancel, onSelect }: RecurringDeleteScopeDialogProps) {
  if (!open) return null
  return (
    <Modal title={title} onClose={onCancel} className="destructive-dialog">
      <div className="destructive-dialog-body">{explanation}</div>
      <div className="recurring-scope-actions">
        <button type="button" className="btn-secondary" onClick={() => onSelect('single')}>{t.destructive.removeOccurrence}</button>
        <button type="button" className="btn-secondary danger-action" onClick={() => onSelect('following')}>{t.destructive.removeFollowing}</button>
        <button type="button" className="danger-action" onClick={() => onSelect('series')}>{t.destructive.removeSeries}</button>
        <button type="button" className="link" onClick={onCancel}>{t.destructive.cancel}</button>
      </div>
    </Modal>
  )
}

interface UndoToastProps {
  message: string
  undoLabel?: string
  onUndo: () => void
  onDismiss?: () => void
}

export function UndoToast({ message, undoLabel, onUndo, onDismiss }: UndoToastProps) {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const id = window.setTimeout(() => { setVisible(false); onDismiss?.() }, 5000)
    return () => window.clearTimeout(id)
  }, [onDismiss])
  if (!visible) return null
  return <div className="undo-toast" role="status" aria-live="polite">
    <span>{message}</span>
    <button type="button" className="link" onClick={() => { setVisible(false); onUndo() }}>{undoLabel ?? t.destructive.undo}</button>
  </div>
}

export function ArchivedItemBadge({ children = t.destructive.archived }: { children?: ReactNode }) {
  return <span className="archived-item-badge">{children}</span>
}
