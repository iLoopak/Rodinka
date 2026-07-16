interface Props {
  checked: boolean
  label: string
  disabled?: boolean
  onClick: () => void
}

export function CompletionCheckbox({ checked, label, disabled = false, onClick }: Props) {
  return (
    <button
      type="button"
      className="completion-checkbox"
      aria-pressed={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <span aria-hidden="true">{checked && <Check size={18} strokeWidth={3} />}</span>
    </button>
  )
}
import { Check } from 'lucide-react'
