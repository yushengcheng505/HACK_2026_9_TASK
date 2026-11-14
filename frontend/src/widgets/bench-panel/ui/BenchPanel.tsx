import { useEffect, useState } from 'react'
import { api } from '@/shared/api'
import { SectionHeader } from '@/shared/ui/SectionHeader'
import { Markdown } from './Markdown'

interface BenchReport {
  summary: { title: string; markdown: string } | null
  series: { id: string; title: string; markdown: string; runs: number }[]
}

const SUMMARY = 'summary'

export function BenchPanel() {
  const [bench, setBench] = useState<BenchReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState(SUMMARY)

  useEffect(() => {
    api
      .get<BenchReport>('/bench')
      .then((report) => {
        setBench(report)
        if (!report.summary && report.series[0]) setSelected(report.series[0].id)
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  const items = [
    ...(bench?.summary ? [{ id: SUMMARY, title: 'Сводка', note: 'исследование и цифры', markdown: bench.summary.markdown }] : []),
    ...(bench?.series ?? []).map((s) => ({ id: s.id, title: s.id, note: `${s.runs} прогонов`, markdown: s.markdown })),
  ]
  const current = items.find((item) => item.id === selected) ?? items[0]

  return (
    <div className="flex h-full flex-col overflow-y-auto lg:overflow-hidden">
      <SectionHeader index="05" kicker="Бенчмарк" title="Качество проверки">
        <span className="max-w-[360px] text-[13px] leading-relaxed text-fg-dim">
          Мини-бенчмарк проверяющих агентов: внедрённые дефекты и сколько из них нашли и исправили.
        </span>
      </SectionHeader>

      <div className="grid gap-6 px-8 py-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav className="flex flex-col gap-1.5" aria-label="Отчёты">
          {bench === null && !error && <div className="h-32 animate-pulse rounded-xl border border-line bg-panel" />}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelected(item.id)}
              className={`press flex cursor-pointer flex-col items-start rounded-xl border px-4 py-2.5 text-left transition-colors duration-150 ${
                item.id === current?.id ? 'border-brand/70 bg-brand-deep/25' : 'border-transparent hover:border-line-strong hover:bg-surface'
              }`}
            >
              <span className={`text-[14px] font-semibold text-fg ${item.id === SUMMARY ? '' : 'font-mono text-[13px]'}`}>{item.title}</span>
              <span className="font-mono text-[11px] text-fg-dim">{item.note}</span>
            </button>
          ))}
          {bench && items.length === 0 && <p className="text-[13px] text-fg-dim">Отчётов пока нет — запустите backend/bench.</p>}
        </nav>

        {error && <p className="font-mono text-[13px] text-hazard">{error}</p>}
        {current && (
          <article key={current.id} className="fx-enter min-w-0 rounded-xl border border-line bg-surface px-7 py-6 lg:overflow-y-auto">
            <div className="max-w-[1000px]">
              <Markdown source={current.markdown} />
            </div>
          </article>
        )}
      </div>
    </div>
  )
}
