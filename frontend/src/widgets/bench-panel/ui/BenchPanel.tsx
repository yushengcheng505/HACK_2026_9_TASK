import { useEffect, useMemo, useRef, useState } from 'react'
import { AGENTS, AgentAvatar } from '@/entities/agent'
import { api } from '@/shared/api'
import { outline } from '../model/markdown'
import { Markdown } from './Markdown'

interface BenchReport {
  summary: { title: string; markdown: string } | null
  series: { id: string; title: string; markdown: string; runs: number }[]
}

const SUMMARY = 'summary'

const cardClass = 'rounded-[28px] border border-line bg-surface shadow-[0_30px_80px_rgba(0,0,0,0.45)]'

const REVIEWERS = AGENTS.filter((agent) => agent.team === 'review')

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
    <div className="flex h-full flex-col overflow-y-auto bg-ink lg:overflow-hidden">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-8 pt-7 pb-6">
        <h1 className="m-0 font-display text-[clamp(26px,2.6vw,40px)] leading-[1.12] font-semibold tracking-[-0.01em]">
          Качество проверки.
          <br />
          <span className="text-brand">Проверяющие под замером.</span>
        </h1>
        <div className="flex flex-col items-start gap-3">
          <p className="m-0 max-w-[380px] text-[14px] leading-[1.6] text-fg-muted">
            Мини-бенчмарк проверяющих агентов: внедрённые дефекты и сколько из них нашли и исправили.
          </p>
          <div className="flex items-center gap-1" aria-hidden="true">
            {REVIEWERS.map((agent) => (
              <AgentAvatar key={agent.id} id={agent.id} size={24} state={bench === null && !error ? 'working' : 'waiting'} />
            ))}
          </div>
        </div>
      </header>

      <div className="grid gap-6 px-8 pb-8 lg:min-h-0 lg:flex-1 lg:grid-cols-[260px_minmax(0,1fr)]">
        <section className={`${cardClass} flex flex-col self-start overflow-hidden lg:max-h-full`} aria-labelledby="reports-title">
          <div className="flex items-baseline justify-between gap-4 px-6 pt-6 pb-4">
            <h2 id="reports-title" className="font-display text-[19px] font-semibold text-fg">
              Отчёты
            </h2>
            <span className="font-mono text-[12px] text-fg-dim">{bench === null ? '…' : `${items.length} шт.`}</span>
          </div>
          <nav className="flex min-h-0 flex-1 flex-col gap-1.5 px-4 pb-6 lg:overflow-y-auto" aria-label="Отчёты">
            {bench === null && !error && <div className="h-40 shrink-0 animate-pulse rounded-[22px] border border-line bg-panel" />}
            {items.map((item, i) => {
              const active = item.id === current?.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelected(item.id)}
                  className={`press flex cursor-pointer items-center gap-3 rounded-[18px] border px-3 py-2.5 text-left transition-[border-color,background-color,box-shadow] duration-150 ${
                    active
                      ? 'border-brand/70 bg-panel shadow-[0_0_0_1px_rgb(1_222_130/0.25),0_0_28px_rgb(1_222_130/0.08)]'
                      : 'border-transparent hover:border-line-strong hover:bg-panel'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`grid size-8 shrink-0 place-items-center rounded-full border font-mono text-[11px] ${
                      active ? 'border-brand/60 text-brand' : 'border-line-strong text-fg-dim'
                    }`}
                  >
                    {item.id === SUMMARY ? 'Σ' : String(bench?.summary ? i : i + 1).padStart(2, '0')}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={`truncate font-semibold text-fg ${item.id === SUMMARY ? 'text-[14px]' : 'font-mono text-[13px]'}`}>
                      {item.title}
                    </span>
                    <span className="truncate font-mono text-[11px] text-fg-dim">{item.note}</span>
                  </span>
                </button>
              )
            })}
            {bench && items.length === 0 && (
              <p className="m-0 rounded-[18px] border border-dashed border-line-strong px-4 py-3 text-[13px] leading-relaxed text-fg-dim">
                Отчётов пока нет — запустите backend/bench.
              </p>
            )}
          </nav>
        </section>

        {error && (
          <div className="self-start rounded-2xl border border-hazard/60 bg-hazard-deep/40 px-4 py-3 font-mono text-[13px] text-hazard">
            {error}
          </div>
        )}
        {current && <Report key={current.id} markdown={current.markdown} />}
      </div>
    </div>
  )
}

/** Отчёт на всю ширину карточки; на широком экране справа — оглавление, которое следит за прокруткой. */
function Report({ markdown }: { markdown: string }) {
  const sections = useMemo(() => outline(markdown), [markdown])
  const [active, setActive] = useState(sections[0]?.id ?? null)
  const scroller = useRef<HTMLElement>(null)

  useEffect(() => {
    const root = scroller.current
    if (!root || sections.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setActive(top.target.id)
      },
      { root, rootMargin: '0px 0px -70% 0px' },
    )
    for (const { id } of sections) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [sections])

  const jump = (id: string) => {
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(id)?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
    setActive(id)
  }

  return (
    <article ref={scroller} className={`${cardClass} fx-enter min-w-0 px-7 py-7 lg:min-h-0 lg:overflow-y-auto`}>
      <div className={sections.length > 0 ? 'grid gap-10 min-[1680px]:grid-cols-[minmax(0,1fr)_clamp(240px,22%,320px)]' : undefined}>
        <div className="min-w-0">
          <Markdown source={markdown} />
        </div>
        {sections.length > 0 && (
          <aside className="hidden min-[1680px]:block" aria-label="Содержание отчёта">
            <nav className="sticky top-0 flex max-h-[calc(100dvh-14rem)] flex-col gap-0.5 overflow-y-auto rounded-[22px] border border-line bg-panel p-4">
              <span className="shrink-0 px-2 pb-2 font-mono text-[11px] tracking-[0.08em] text-fg-dim uppercase">Содержание</span>
              {sections.map((section, i) => {
                const on = section.id === active
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => jump(section.id)}
                    aria-current={on ? 'location' : undefined}
                    className={`press flex shrink-0 cursor-pointer items-baseline gap-2.5 rounded-xl px-2 py-1.5 text-left text-[13px] leading-[1.4] transition-colors duration-150 ${
                      on ? 'bg-brand-deep/40 text-brand' : 'text-fg-muted hover:bg-surface hover:text-fg'
                    }`}
                  >
                    <span className={`shrink-0 font-mono text-[11px] tabular-nums ${on ? 'text-brand' : 'text-fg-dim'}`}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span>{section.text}</span>
                  </button>
                )
              })}
            </nav>
          </aside>
        )}
      </div>
    </article>
  )
}
