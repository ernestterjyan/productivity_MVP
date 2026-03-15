import type { PropsWithChildren, ReactNode } from 'react'

interface SectionCardProps extends PropsWithChildren {
  title: string
  subtitle?: string
  actions?: ReactNode
  className?: string
}

export function SectionCard({
  title,
  subtitle,
  actions,
  className,
  children,
}: SectionCardProps) {
  return (
    <section className={`section-card ${className ?? ''}`.trim()}>
      <header className="section-card__header">
        <div>
          <p className="eyebrow">{title}</p>
          {subtitle ? <h2>{subtitle}</h2> : null}
        </div>
        {actions ? <div className="section-card__actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  )
}
