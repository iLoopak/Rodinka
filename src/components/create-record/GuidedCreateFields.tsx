import type { ReactNode } from 'react'
import type { FamilyMember } from '../../hooks/useFamilyMembers'
import { t } from '../../strings'
import { addDays, todayISODate } from '../../utils/dueDate'
import { MemberAvatar } from '../ui/MemberAvatar'

function firstName(displayName: string) {
  return displayName.trim().split(/\s+/)[0] || displayName
}

interface MemberChoicePickerProps {
  label: string
  members: FamilyMember[]
  value: string
  onChange: (memberId: string) => void
  emptyLabel?: string
  required?: boolean
}

export function MemberChoicePicker({ label, members, value, onChange, emptyLabel, required = false }: MemberChoicePickerProps) {
  return <fieldset className="guided-choice-fieldset">
    <legend>{label}</legend>
    <div className="guided-member-grid">
      {!required && <button
        type="button"
        className={`guided-member-choice${value === '' ? ' selected' : ''}`}
        aria-pressed={value === ''}
        onClick={() => onChange('')}
      >
        <span className="guided-member-empty" aria-hidden="true">{t.create.guided.anyoneSymbol}</span>
        <span>{emptyLabel ?? t.create.guided.anyone}</span>
      </button>}
      {members.map((member) => {
        const selected = value === member.id
        return <button
          key={member.id}
          type="button"
          className={`guided-member-choice${selected ? ' selected' : ''}`}
          aria-pressed={selected}
          aria-label={member.display_name}
          onClick={() => onChange(member.id)}
        >
          <MemberAvatar member={member} size={30} />
          <span>{firstName(member.display_name)}</span>
          <span className="guided-choice-check" aria-hidden="true">✓</span>
        </button>
      })}
    </div>
  </fieldset>
}

interface DateShortcutFieldProps {
  label: string
  value: string
  onChange: (date: string) => void
  allowEmpty?: boolean
  required?: boolean
}

export function DateShortcutField({ label, value, onChange, allowEmpty = false, required = false }: DateShortcutFieldProps) {
  const today = todayISODate()
  const tomorrow = addDays(today, 1)
  const shortcuts = [
    { value: today, label: t.create.guided.today },
    { value: tomorrow, label: t.create.guided.tomorrow },
    ...(allowEmpty ? [{ value: '', label: t.create.guided.noDate }] : []),
  ]

  return <div className="guided-date-field">
    <span className="guided-field-label">{label}</span>
    <div className="guided-shortcut-row" role="group" aria-label={label}>
      {shortcuts.map((shortcut) => <button
        key={shortcut.label}
        type="button"
        className={`guided-shortcut${value === shortcut.value ? ' selected' : ''}`}
        aria-pressed={value === shortcut.value}
        onClick={() => onChange(shortcut.value)}
      >{shortcut.label}</button>)}
    </div>
    <input
      aria-label={t.create.guided.chooseDate}
      required={required}
      type="date"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  </div>
}

interface GuidedDisclosureProps {
  open: boolean
  onToggle: () => void
  children: ReactNode
}

export function GuidedDisclosure({ open, onToggle, children }: GuidedDisclosureProps) {
  return <div className={`guided-disclosure${open ? ' open' : ''}`}>
    <button
      type="button"
      className="guided-disclosure-button"
      aria-expanded={open}
      onClick={onToggle}
      data-create-ignore-dirty
    >
      <span>{open ? t.create.guided.hideDetails : t.create.guided.addDetails}</span>
      <span aria-hidden="true">{open ? '−' : '+'}</span>
    </button>
    {open && <div className="guided-disclosure-content">{children}</div>}
  </div>
}

export function GuidedLead({ children = t.create.guided.lead }: { children?: ReactNode }) {
  return <p className="guided-create-lead">{children}</p>
}
