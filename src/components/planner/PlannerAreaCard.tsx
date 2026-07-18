import type { ReactNode } from 'react'
import { Link, type Route } from '../../router'

interface Props {
  to: Route
  icon: ReactNode
  colorVar: string
  title: string
  summary: string
  details: string[]
  ariaLabel: string
}

export function PlannerAreaCard({ to, icon, colorVar, title, summary, details, ariaLabel }: Props) {
  return (
    <article className="planner-area-card">
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
        <span className="planner-area-chevron" aria-hidden="true">›</span>
      </Link>
    </article>
  )
}
