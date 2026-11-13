import { LogoMark } from '@/shared/ui/LogoMark'

const NAV_LINKS = [
  { href: '#stage', label: 'Как это работает' },
  { href: '#result', label: 'Результат' },
] as const

export function SiteHeader() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 py-6">
      <a href="#stage" className="flex items-center gap-3 text-fg">
        <LogoMark />
        <span className="font-display text-[22px] font-bold tracking-[0.02em]">Стая</span>
        <span className="rounded-full border border-line-strong px-2.5 py-1 font-mono text-[12px] text-fg-dim">
          кейс №9 · MVP
        </span>
      </a>
      <nav aria-label="Основная навигация" className="flex flex-wrap items-center gap-7 text-[15px] font-semibold">
        {NAV_LINKS.map((link) => (
          <a key={link.href} href={link.href} className="text-mint hover:text-brand">
            {link.label}
          </a>
        ))}
        <a
          href="#task"
          className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 py-3 text-ink hover:bg-brand-hover"
        >
          Новая задача
        </a>
      </nav>
    </header>
  )
}
