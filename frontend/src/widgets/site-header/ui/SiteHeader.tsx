import { BrandName } from '@/shared/ui/BrandName'
import { LogoMark } from '@/shared/ui/LogoMark'

export function SiteHeader() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 py-6">
      <a href="/" className="flex items-center gap-3">
        <LogoMark />
        <BrandName className="text-[24px]" />
      </a>
      <nav aria-label="Основная навигация">
        <a
          href="/console/"
          className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 py-3 text-[15px] font-semibold text-ink hover:bg-brand-hover"
        >
          Открыть консоль
        </a>
      </nav>
    </header>
  )
}
