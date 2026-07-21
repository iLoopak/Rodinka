import { t } from '../../strings'
import { AppPrimaryAddButton } from '../ui/AddAction'

export function TodayProgramEmpty({ onAdd }: { onAdd?: () => void }) {
  return (
    <div className="today-program-empty">
      <span className="today-program-empty-copy">
        <strong>{t.today.programEmpty}</strong>
        <span>{t.today.programEmptyBody}</span>
      </span>
      {onAdd && <AppPrimaryAddButton className="today-program-empty-action" onClick={onAdd}>{t.create.addAction}</AppPrimaryAddButton>}
    </div>
  )
}
