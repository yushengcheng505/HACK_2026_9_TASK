import { useEffect, useState } from 'react'
import type { RunRecord } from '@/entities/run'
import { STATUS_LABEL } from '@/entities/run'
import { api } from '@/shared/api'
import { SectionHeader } from '@/shared/ui/SectionHeader'
import { routeHref } from '@/shared/lib/useHashRoute'

const formatTime = (ts: number) =>
  new Date(ts * 1000).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

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
    <div className="h-full overflow-y-auto">
      <SectionHeader index="02" kicker="Журнал" title="Запуски агента">
        <span className="tag text-fg-dim">{runs ? `${runs.length} записей` : 'загрузка…'}</span>
      </SectionHeader>
      <div className="px-8 py-6">
        <div className="grid grid-cols-[110px_minmax(0,1fr)_150px_repeat(4,72px)_130px] gap-px border border-line bg-line">
          {['Время', 'Эпик', 'Статус', 'REQ', 'US', 'TASK', 'GAP', 'Модель'].map((h) => (
            <div key={h} className="tag bg-surface px-3 py-2.5 text-fg-dim">
              {h}
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
                className="fx-enter group col-span-full grid grid-cols-subgrid bg-ink hover:bg-surface"
                style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
              >
                <span className="px-3 py-3 font-mono text-[12px] text-fg-dim">{formatTime(run.created_at)}</span>
                <span className="truncate px-3 py-3 text-[14px] font-semibold text-fg group-hover:text-brand">
                  {run.title}
                </span>
                <span className={`flex items-center gap-2 px-3 py-3 ${status.cls}`}>
                  <span className={`size-1.5 rounded-full ${status.dot}`} />
                  <span className="tag">{status.text}</span>
                </span>
                {cells.map((v, j) => (
                  <span key={j} className="px-3 py-3 text-right font-mono text-[13px] text-fg-soft tabular-nums">
                    {v ?? '—'}
                  </span>
                ))}
                <span className="truncate px-3 py-3 font-mono text-[12px] text-fg-dim">{run.model ?? '—'}</span>
              </a>
            )
          })}
        </div>
        {runs?.length === 0 && <p className="mt-6 text-fg-muted">Запусков пока нет — начните с галереи эпиков.</p>}
      </div>
    </div>
  )
}
