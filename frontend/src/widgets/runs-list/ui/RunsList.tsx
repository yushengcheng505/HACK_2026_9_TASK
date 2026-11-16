import { useEffect, useState } from 'react'
import type { RunRecord } from '@/entities/run'
import { STATUS_LABEL } from '@/entities/run'
import { api } from '@/shared/api'
import { LogoMark } from '@/shared/ui/LogoMark'
import { routeHref } from '@/shared/lib/useHashRoute'

const formatTime = (ts: number) =>
  new Date(ts * 1000).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

const originLabel = (run: RunRecord) => {
  if (run.origin === 'demo') return run.demo_id ? `шаблон · ${run.demo_id}` : 'шаблон'
  if (run.origin === 'ui') return 'свой эпик'
  return run.origin
}

const COLUMNS = 'grid-cols-[124px_minmax(0,1fr)_150px_repeat(4,60px)_140px]'
const HEADERS = ['Время', 'Эпик', 'Статус', 'REQ', 'US', 'TASK', 'GAP', 'Модель']

export function RunsList() {
  const [runs, setRuns] = useState<RunRecord[] | null>(null)

  useEffect(() => {
    let alive = true
    const load = () => api.get<RunRecord[]>('/runs').then((r) => alive && setRuns(r))
    void load()
    const timer = window.setInterval(load, 5000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

  return (
    <div className="h-full overflow-y-auto bg-ink">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 pt-6 pb-5 sm:px-8 sm:pt-7 sm:pb-6">
        <h1 className="m-0 font-display text-[clamp(26px,2.6vw,40px)] leading-[1.12] font-semibold tracking-[-0.01em]">
          Запуски агента
        </h1>
        <p className="m-0 max-w-[380px] text-[14px] leading-[1.6] text-fg-muted">
          Каждый запуск можно открыть: карта, задачи, проверки и выгрузка. Список обновляется сам.
        </p>
      </header>

      <div className="px-4 pb-6 sm:px-8 sm:pb-8">
        <section
          aria-label="Журнал запусков"
          className="overflow-x-auto rounded-[28px] border border-line bg-surface shadow-[0_30px_80px_rgba(0,0,0,0.45)]"
        >
          <div className="flex items-baseline justify-between gap-4 px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
            <h2 className="font-display text-[19px] font-semibold text-fg">Журнал</h2>
            <span className="font-mono text-[12px] text-fg-dim">{runs ? `${runs.length} шт.` : 'загрузка…'}</span>
          </div>

          <ul className="m-0 flex list-none flex-col gap-1 px-2 pb-3 md:hidden">
            {runs === null &&
              [0, 1, 2].map((i) => (
                <li key={i} className="px-1 py-1">
                  <div className="h-24 animate-pulse rounded-2xl bg-panel" />
                </li>
              ))}
            {runs?.map((run, i) => {
              const status = STATUS_LABEL[run.status]
              const stats = [
                ['REQ', run.stats?.requirements_count],
                ['US', run.stats?.stories_count],
                ['TASK', run.stats?.tasks_count],
                ['GAP', run.stats?.gaps_count],
              ] as const
              return (
                <li key={run.id}>
                  <a
                    href={routeHref({ name: 'run', id: run.id })}
                    className="fx-enter press flex flex-col gap-2 rounded-2xl border border-line bg-ink/40 px-4 py-3.5 active:bg-panel"
                    style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[12px] whitespace-nowrap text-fg-dim">{formatTime(run.created_at)}</span>
                      <span className={`inline-flex shrink-0 items-center gap-2 rounded-full border border-current/30 px-2.5 py-0.5 text-[12px] font-semibold ${status.cls}`}>
                        <span className={`size-1.5 rounded-full ${status.dot}`} />
                        {status.text}
                      </span>
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="line-clamp-2 text-[15px] leading-snug font-semibold text-fg">{run.title}</span>
                      <span className="truncate font-mono text-[11px] text-fg-dim">
                        {originLabel(run)}
                        {run.model ? ` · ${run.model}` : ''}
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[12px] tabular-nums">
                      {stats.map(([label, v]) => (
                        <span key={label} className="text-fg-dim">
                          {label} <b className={`font-medium ${v == null ? 'text-fg-dim/50' : 'text-fg-soft'}`}>{v ?? '—'}</b>
                        </span>
                      ))}
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>

          <div className={`${COLUMNS} hidden min-w-[860px] px-3 pb-3 md:grid`}>
            {HEADERS.map((h, i) => (
              <div
                key={h}
                className={`border-b border-line px-3 pb-3 font-mono text-[11px] tracking-[0.1em] text-fg-dim uppercase ${
                  i >= 3 && i <= 6 ? 'text-right' : ''
                }`}
              >
                {h}
              </div>
            ))}

            {runs === null &&
              [0, 1, 2].map((i) => (
                <div key={i} className="col-span-full px-3 py-2">
                  <div className="h-11 animate-pulse rounded-2xl bg-panel" />
                </div>
              ))}

            {runs?.map((run, i) => {
              const status = STATUS_LABEL[run.status]
              const cells = [
                run.stats?.requirements_count,
                run.stats?.stories_count,
                run.stats?.tasks_count,
                run.stats?.gaps_count,
              ]
              return (
                <a
                  key={run.id}
                  href={routeHref({ name: 'run', id: run.id })}
                  className="fx-enter group col-span-full mt-1 grid grid-cols-subgrid items-center rounded-2xl transition-colors duration-150 hover:bg-panel"
                  style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                >
                  <span className="px-3 py-3.5 font-mono text-[12px] whitespace-nowrap text-fg-dim">
                    {formatTime(run.created_at)}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5 px-3 py-3">
                    <span className="truncate text-[15px] font-semibold text-fg group-hover:text-brand">{run.title}</span>
                    <span className="truncate font-mono text-[11px] text-fg-dim">{originLabel(run)}</span>
                  </span>
                  <span className="px-3 py-3">
                    <span
                      className={`inline-flex items-center gap-2 rounded-full border border-current/30 px-3 py-1 text-[12px] font-semibold ${status.cls}`}
                    >
                      <span className={`size-1.5 rounded-full ${status.dot}`} />
                      {status.text}
                    </span>
                  </span>
                  {cells.map((v, j) => (
                    <span
                      key={j}
                      className={`px-3 py-3.5 text-right font-mono text-[13px] tabular-nums ${v == null ? 'text-fg-dim/50' : 'text-fg-soft'}`}
                    >
                      {v ?? '—'}
                    </span>
                  ))}
                  <span className="truncate px-3 py-3.5 font-mono text-[12px] text-fg-dim" title={run.model ?? undefined}>
                    {run.model ?? '—'}
                  </span>
                </a>
              )
            })}
          </div>

          {runs?.length === 0 && (
            <div className="flex flex-col items-center gap-4 px-6 pt-6 pb-12 text-center">
              <LogoMark />
              <p className="m-0 max-w-[340px] text-[15px] leading-relaxed text-fg-muted">
                Запусков пока нет. NAPS ждёт первый эпик.
              </p>
              <a
                href={routeHref({ name: 'launch' })}
                className="press inline-flex min-h-11 items-center gap-2 rounded-full bg-brand px-5 font-display text-[13px] font-semibold text-ink hover:bg-brand-hover"
              >
                Новый запуск
                <span aria-hidden="true">→</span>
              </a>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
