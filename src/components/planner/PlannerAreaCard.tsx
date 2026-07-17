import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { Link, type Route } from '../../router'

interface Props {
  to: Route
  icon: ReactNode
  colorVar: string
  title: string
  summary: string
  details: string[]
  ariaLabel: string
  createLabel: string
  onCreate: () => void
}

export function PlannerAreaCard({ to, icon, colorVar, title, summary, details, ariaLabel, createLabel, onCreate }: Props) {
  function handleCreateClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    onCreate()
  }

  return (
    <article
      className="planner-area-card"
      style={{ '--area-accent': `var(${colorVar})` } as CSSProperties}
    >
      <Link to={to} className="planner-area-link" aria-label={ariaLabel}>
        <span
          className="item-type-icon planner-area-icon"
          style={{ backgroundColor: `color-mix(in srgb, var(${colorVar}) 10%, transparent)`, color: `var(${colorVar})` }}
        >{icon}</span>
        <span className="planner-area-copy">
          <span className="planner-area-heading">{title}</span>
          <span className="planner-area-summary">{summary}</span>
          {details.map((detail) => <span key={detail} className="planner-area-detail">{detail}</span>)}
        </span>
      </Link>
      {/* Quiet on purpose: the hub header owns the one primary create action,
          so five module creates must not read as five competing buttons. */}
      <button type="button" className="planner-area-create" onClick={handleCreateClick} aria-label={createLabel}>
        <Plus aria-hidden="true" strokeWidth={2.4} />
      </button>
    </article>
  )
}
