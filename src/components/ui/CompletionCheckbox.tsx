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
      <span aria-hidden="true">{checked ? '✓' : ''}</span>
    </button>
  )
}
