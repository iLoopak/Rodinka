import type { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  leading?: ReactNode
  actions?: ReactNode
  className?: string
  titleTabIndex?: number
}

export function ScreenHeader({ title, subtitle, leading, actions, className, titleTabIndex }: Props) {
  return (
    <header className={`screen-header feature-screen-header${className ? ` ${className}` : ''}`}>
      <div className="feature-screen-heading">
        {leading}
        <div>
          <h1 className="home-title" tabIndex={titleTabIndex}>{title}</h1>
          {subtitle && <p className="home-subtitle">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="header-actions">{actions}</div>}
    </header>
  )
}
