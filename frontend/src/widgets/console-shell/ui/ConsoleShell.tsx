import type { ReactNode } from 'react'
import { LogoMark } from '@/shared/ui/LogoMark'
import { isClosedContour, useHealth } from '@/shared/lib/useHealth'
import type { ConsoleRoute } from '@/shared/lib/useHashRoute'
import { routeHref } from '@/shared/lib/useHashRoute'

interface ConsoleShellProps {
  route: ConsoleRoute
  children: ReactNode
}

const NAV: { route: ConsoleRoute; index: string; label: string }[] = [
  { route: { name: 'launch' }, index: '01', label: 'Новый запуск' },
  { route: { name: 'runs' }, index: '02', label: 'Запуски' },
]

export function ConsoleShell({ route, children }: ConsoleShellProps) {
  const health = useHealth()
  return (
    <div className="bp-grid grid h-full grid-cols-[216px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-r border-line bg-ink/90">
        <a href="/" className="flex items-center gap-3 border-b border-line px-4 py-4" title="На лендинг">
          <LogoMark />
          <span className="flex flex-col">
            <span className="font-display text-[15px] font-semibold tracking-tight text-fg">Стая</span>
            <span className="tag text-fg-dim">Пульт декомпозиции</span>
          </span>
        </a>

        <nav className="flex flex-col gap-px p-2" aria-label="Разделы пульта">
          {NAV.map((item) => {
            const active = item.route.name === route.name || (item.route.name === 'runs' && route.name === 'run')
            return (
              <a
                key={item.index}
                href={routeHref(item.route)}
                aria-current={active ? 'page' : undefined}
                className={`press flex items-center gap-3 rounded-[2px] px-3 py-2.5 ${
                  active ? 'bg-panel text-brand' : 'text-fg-muted hover:bg-surface hover:text-fg'
                }`}
              >
                <span className="tag text-fg-dim">{item.index}</span>
                <span className="text-[14px] font-semibold">{item.label}</span>
              </a>
            )
          })}
        </nav>

        <div className="mt-auto border-t border-line p-4">
          <div className="tag mb-3 text-fg-dim">[ Модель ]</div>
          {health === null && <div className="tag text-fg-dim">опрос…</div>}
          {health === 'offline' && (
            <div className="flex items-center gap-2">
              <span className="size-2 bg-hazard" />
              <span className="tag text-hazard">Бэкенд недоступен</span>
            </div>
          )}
          {health && health !== 'offline' && (
            <dl className="flex flex-col gap-2">
              <div>
                <dt className="tag text-fg-dim">Модель</dt>
                <dd className="truncate font-mono text-[12px] text-fg" title={health.model}>
                  {health.model}
                </dd>
              </div>
              <div>
                <dt className="tag text-fg-dim">Хост</dt>
                <dd className="truncate font-mono text-[12px] text-fg-soft" title={health.llm_host}>
                  {health.llm_host}
                </dd>
              </div>
              <div className="mt-1 flex items-center gap-2">
                {isClosedContour(health.llm_host) ? (
                  <>
                    <span className="fx-pulse size-2 rounded-full bg-brand" />
                    <span className="tag text-brand">Замкнутый контур</span>
                  </>
                ) : (
                  <>
                    <span className="size-2 rounded-full bg-amber" />
                    <span className="tag text-amber">Внешний хост</span>
                  </>
                )}
              </div>
            </dl>
          )}
        </div>
      </aside>

      <main className="min-h-0 min-w-0 overflow-hidden">{children}</main>
    </div>
  )
}
