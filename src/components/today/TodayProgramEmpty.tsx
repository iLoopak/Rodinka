import { t } from '../../strings'

export function TodayProgramEmpty({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="today-program-empty">
      <span className="today-program-empty-copy">
        <strong>{t.today.programEmpty}</strong>
        <span>{t.today.programEmptyBody}</span>
      </span>
      <button type="button" className="link today-program-empty-action" onClick={onAdd}>
        <span aria-hidden="true">+</span> {t.create.addAction}
      </button>
    </div>
  )
}
