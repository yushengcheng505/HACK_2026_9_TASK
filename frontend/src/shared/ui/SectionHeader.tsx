import type { ReactNode } from 'react'

interface SectionHeaderProps {
  index: string
  kicker: string
  title: string
  children?: ReactNode
}

export function SectionHeader({ index, kicker, title, children }: SectionHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6 border-b border-line px-8 pt-8 pb-6">
      <div className="flex flex-col gap-3">
        <span className="tag text-brand">
          [ {index} / {kicker} ]
        </span>
        <h1 className="font-display text-[clamp(28px,3.2vw,44px)] leading-[0.95] font-semibold tracking-[-0.03em] text-fg">
          {title}
        </h1>
      </div>
      {children}
    </header>
  )
}
