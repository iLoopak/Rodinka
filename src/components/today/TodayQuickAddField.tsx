interface Props {
  value: string
  placeholder: string
  accessibleLabel: string
  submitLabel: string
  busy: boolean
  inputRef?: React.Ref<HTMLInputElement>
  onChange: (value: string) => void
  onSubmit: (event: React.FormEvent) => void
}

export function TodayQuickAddField({ value, placeholder, accessibleLabel, submitLabel, busy, inputRef, onChange, onSubmit }: Props) {
  return (
    <form className="today-quick-add-field" onSubmit={onSubmit} aria-busy={busy}>
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={accessibleLabel}
        readOnly={busy}
      />
      <button type="submit" disabled={busy || !value.trim()} aria-label={`${submitLabel}: ${accessibleLabel}`}>
        <span aria-hidden="true">+</span>
        <span className="today-quick-add-button-label">{submitLabel}</span>
      </button>
    </form>
  )
}
