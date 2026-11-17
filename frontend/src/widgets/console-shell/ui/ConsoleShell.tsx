import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ModelPicker, useModelChoice } from '@/features/choose-model'
import { BrandName } from '@/shared/ui/BrandName'
import { LogoMark } from '@/shared/ui/LogoMark'
import { isClosedContour, useHealth } from '@/shared/lib/useHealth'
import type { ConsoleRoute } from '@/shared/lib/useHashRoute'
import { routeHref } from '@/shared/lib/useHashRoute'

interface ConsoleShellProps {
  route: ConsoleRoute
  /** Без боковой панели — экран целиком отдан прогону (граф агентов или пульт). */
  bare?: boolean
  children: ReactNode
}

const NAV: { route: ConsoleRoute; index: string; label: string }[] = [
  { route: { name: 'launch' }, index: '01', label: 'Новый запуск' },
  { route: { name: 'runs' }, index: '02', label: 'Запуски' },
  { route: { name: 'models' }, index: '03', label: 'Модели' },
  { route: { name: 'prompts' }, index: '04', label: 'Промпты' },
  { route: { name: 'bench' }, index: '05', label: 'Бенчмарк' },
]

export function ConsoleShell({ route, bare = false, children }: ConsoleShellProps) {
  const health = useHealth()
  const { providers, choice } = useModelChoice()
  const provider = providers?.find((p) => p.id === choice?.providerId)
  let host = ''
  if (provider?.base_url) {
    try { host = new URL(provider.base_url).host } catch { /* Некорректный адрес не считается локальным. */ }
  }
  if (!host && provider?.builtin && health && health !== 'offline') host = health.llm_host
  const [menu, setMenu] = useState(false)
  const [menuRoute, setMenuRoute] = useState(route)
  if (menuRoute !== route) {
    setMenuRoute(route)
    setMenu(false)
  }
  const current = NAV.find((item) => item.route.name === route.name || (item.route.name === 'runs' && route.name === 'run'))

  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu])

  return (
    <div
      className={`bp-grid grid h-full ${
        bare ? 'grid-cols-[minmax(0,1fr)]' : 'grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[216px_minmax(0,1fr)] lg:grid-rows-1'
      }`}
    >
      {!bare && (
        <header className="cs-topbar flex items-center gap-3 border-b border-line bg-ink/90 px-4 lg:hidden">
          <a href="/" className="flex shrink-0 items-center" title="На лендинг" aria-label="На лендинг">
            <LogoMark />
          </a>
          <span className="flex min-w-0 flex-1 flex-col">
            <BrandName className="text-[14px]" />
            <span className="tag truncate text-fg-dim">{current?.label ?? 'Пульт декомпозиции'}</span>
          </span>
          <button
            type="button"
            onClick={() => setMenu(true)}
            aria-expanded={menu}
            aria-controls="console-menu"
            aria-label="Открыть меню"
            className="press grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl border border-line-strong text-fg-soft"
          >
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M1 1h16M1 7h16M1 13h16" />
            </svg>
          </button>
        </header>
      )}
      {!bare && (
        <div
          className={`cs-scrim fixed inset-0 z-40 bg-ink/70 backdrop-blur-[2px] lg:hidden ${menu ? 'cs-scrim-on' : ''}`}
          onClick={() => setMenu(false)}
          aria-hidden="true"
        />
      )}
      <aside
        id="console-menu"
        className={`${bare ? 'hidden' : 'flex'} cs-drawer ${menu ? 'cs-drawer-on' : ''} min-h-0 flex-col overflow-y-auto overscroll-contain border-r border-line bg-ink lg:bg-ink/90`}
      >
        <a href="/" className="flex items-center gap-3 border-b border-line px-4 py-4" title="На лендинг">
          <LogoMark />
          <span className="flex flex-col">
            <BrandName className="text-[15px]" />
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
                className={`press flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                  active ? 'bg-panel text-brand' : 'text-fg-muted hover:bg-surface hover:text-fg'
                }`}
              >
                <span className="tag text-fg-dim">{item.index}</span>
                <span className="text-[14px] font-semibold">{item.label}</span>
              </a>
            )
          })}
        </nav>

        <div className="mt-auto shrink-0 border-t border-line p-4">
          {!bare && <ModelPicker />}
          <div className="mt-4">
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
                  <dt className="tag text-fg-dim">Хост</dt>
                  <dd className="truncate font-mono text-[12px] text-fg-soft" title={host}>
                    {host || '—'}
                  </dd>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  {isClosedContour(host) ? (
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
        </div>
      </aside>

      <main className={`min-h-0 min-w-0 overflow-hidden ${bare ? '' : 'pb-[env(safe-area-inset-bottom)] lg:col-start-2 lg:row-start-1 lg:pb-0'}`}>{children}</main>
    </div>
  )
}
