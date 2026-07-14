import type { CSSProperties, ReactNode } from 'react'
import { Link, type Route } from '../../router'

interface Props {
  to: Route
  icon: ReactNode
  colorVar: string
  surfaceVar: string
  borderVar: string
  title: string
  summary: string
  details: string[]
  ariaLabel: string
}

export function PlannerAreaCard({ to, icon, colorVar, surfaceVar, borderVar, title, summary, details, ariaLabel }: Props) {
  return (
    <Link
      to={to}
      className="planner-area-card"
      aria-label={ariaLabel}
      style={{
        '--area-accent': `var(${colorVar})`,
        '--area-surface': `var(${surfaceVar})`,
        '--area-border': `var(${borderVar})`,
      } as CSSProperties}
    >
      <span className="planner-area-icon" style={{ color: `var(${colorVar})` }}>
        {icon}
      </span>
      <span className="planner-area-copy">
        <span className="planner-area-heading">{title}</span>
        <span className="planner-area-summary">{summary}</span>
        {details.map((detail) => (
          <span key={detail} className="planner-area-detail">
            {detail}
          </span>
        ))}
      </span>
      <span className="planner-area-chevron" aria-hidden="true">
        ›
      </span>
    </Link>
  )
}
