import { PIPELINE } from '@/entities/run'
import type { NodePhase, RunView } from '@/entities/run'

const DOT: Record<NodePhase, string> = {
  idle: 'border border-line-input bg-ink',
  active: 'bg-brand fx-pulse',
  done: 'bg-brand',
  waiting: 'bg-amber fx-pulse-amber',
}

const COLS = PIPELINE.length
const center = (i: number) => ((i + 0.5) / COLS) * 100
const TASKS = PIPELINE.findIndex((p) => p.node === 'tasks')
const CRITIC = PIPELINE.findIndex((p) => p.node === 'critic')

export function PipelineRail({ view }: { view: RunView }) {
  const reached = PIPELINE.reduce((last, p, i) => (view.nodes[p.node].phase !== 'idle' ? i : last), -1)
  const activeIndex = PIPELINE.findIndex((p) => p.node === view.activeNode)
  const finished = view.status === 'done'
  const fill = finished ? 1 : reached <= 0 ? 0 : (center(reached) - center(0)) / (center(COLS - 1) - center(0))
  const loopActive = view.activeNode === 'tasks' && view.nodes.tasks.visits > 1
  const showLoop = view.criticRound > 0

  return (
    <section aria-label="Конвейер агента" className="relative border-b border-line bg-ink/80 px-2 pt-1 pb-3">
      {/* петля критика: дуга от «Критик» назад к «Задачи» */}
      <div className="pointer-events-none absolute inset-x-2 top-1 h-8" aria-hidden="true">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1000 32" preserveAspectRatio="none">
          <path
            d={`M ${center(CRITIC) * 10} 30 C ${center(CRITIC) * 10} 2, ${center(TASKS) * 10} 2, ${center(TASKS) * 10} 30`}
            fill="none"
            vectorEffect="non-scaling-stroke"
            strokeWidth="1"
            strokeDasharray={showLoop ? undefined : '2 5'}
            className={`transition-[stroke,opacity] duration-300 ${
              showLoop ? (loopActive ? 'fx-flow stroke-amber' : 'stroke-amber/60') : 'stroke-line-strong opacity-60'
            }`}
          />
        </svg>
        <span
          className={`tag absolute top-0 -translate-x-1/2 px-1.5 text-[10px] transition-colors duration-300 ${
            showLoop ? 'bg-amber-deep text-amber' : 'text-fg-dim/60'
          }`}
          style={{ left: `${(center(TASKS) + center(CRITIC)) / 2}%` }}
        >
          {showLoop ? `доработка · круг ${view.criticRound}/2` : 'петля критика'}
        </span>
      </div>

      <div className="relative mt-8">
        {/* рельс */}
        <div className="absolute top-[5px] h-px bg-line-strong" style={{ left: `${center(0)}%`, right: `${100 - center(COLS - 1)}%` }}>
          <div
            className="h-full origin-left bg-brand transition-transform duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]"
            style={{ transform: `scaleX(${fill})` }}
          />
        </div>
        {activeIndex > 0 && !finished && (
          <div
            className="absolute top-[4px] h-[3px] overflow-hidden"
            style={{ left: `${center(activeIndex - 1)}%`, width: `${center(activeIndex) - center(activeIndex - 1)}%` }}
          >
            <div className="fx-beam h-full w-1/4 bg-gradient-to-r from-transparent via-brand-hover to-transparent" />
          </div>
        )}

        <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
          {PIPELINE.map((p, i) => {
            const state = view.nodes[p.node]
            const isActive = state.phase === 'active' || state.phase === 'waiting'
            return (
              <li key={p.node} className="flex min-w-0 flex-col items-center gap-1.5 px-1 text-center">
                <span className={`size-[11px] rounded-[1px] transition-colors duration-300 ${DOT[state.phase]}`} />
                <span className="tag text-[10px] text-fg-dim">{String(i + 1).padStart(2, '0')}</span>
                <span
                  className={`text-[12.5px] leading-tight font-semibold transition-colors duration-300 ${
                    state.phase === 'waiting' ? 'text-amber' : isActive ? 'text-brand' : state.phase === 'done' ? 'text-fg' : 'text-fg-dim'
                  }`}
                >
                  {p.label}
                  {state.visits > 1 && <span className="ml-1 font-mono text-[10px] text-amber">×{state.visits}</span>}
                </span>
                <span className="line-clamp-2 min-h-[26px] font-mono text-[10.5px] leading-[13px] text-fg-dim" title={state.summary}>
                  {state.phase === 'active' ? (
                    <span className="text-brand">
                      работает<span className="fx-blink">_</span>
                    </span>
                  ) : state.phase === 'waiting' ? (
                    <span className="text-amber">ждёт ответов</span>
                  ) : (
                    state.summary
                  )}
                </span>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
