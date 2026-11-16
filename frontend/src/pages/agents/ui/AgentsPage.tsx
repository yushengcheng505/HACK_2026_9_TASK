import { useState } from 'react'
import { AgentAvatar, ROSTER, TEAM_LABELS } from '@/entities/agent'
import type { AgentState, AgentTeam } from '@/entities/agent'
import { BrandName } from '@/shared/ui/BrandName'

const STATES: readonly { id: AgentState; label: string; hint: string }[] = [
  { id: 'waiting', label: 'Ожидание', hint: 'моргает и еле заметно дышит' },
  { id: 'working', label: 'Работа', hint: 'сосредоточен, атрибут в деле' },
  { id: 'done', label: 'Успех', hint: 'улыбается, подпрыгивает, галочка' },
]

const TEAMS: readonly AgentTeam[] = ['decomposition', 'review']

const GRID = 'grid grid-cols-3 gap-2 sm:grid-cols-[200px_repeat(3,minmax(0,1fr))] sm:gap-3'

/** Витрина маленьких роботов: каждый агент в трёх состояниях, крупно и в натуральную величину. */
export function AgentsPage() {
  const [replay, setReplay] = useState(0)

  return (
    <div className="min-h-screen bg-ink font-sans text-fg">
      <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <a href="/" className="font-mono text-[13px] text-fg-dim hover:text-brand">
              ← на главную
            </a>
            <h1 className="mt-3 font-display text-[28px] font-bold leading-tight sm:text-[34px]">
              Маленькие агенты <BrandName className="text-[28px] sm:text-[34px]" />
            </h1>
            <p className="mt-2 text-[15px] text-fg-muted">
              {ROSTER.length} ролей в трёх состояниях. Слева крупно, справа — в натуральную величину (40 px).
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReplay((count) => count + 1)}
            className="inline-flex min-h-11 items-center rounded-full border border-line-strong px-5 py-3 font-mono text-[13px] text-fg-soft hover:border-brand hover:text-brand"
          >
            Повторить прыжок «Успеха»
          </button>
        </header>

        <div className={`${GRID} sticky top-0 z-10 bg-ink/95 py-3 backdrop-blur`}>
          <span className="max-sm:hidden" />
          {STATES.map((state) => (
            <div key={state.id} className="min-w-0 sm:px-4">
              <div className="font-display text-[15px] font-semibold sm:text-[17px]">{state.label}</div>
              <div className="font-mono text-[11px] text-fg-dim max-sm:hidden">{state.hint}</div>
            </div>
          ))}
        </div>

        {TEAMS.map((team, teamIndex) => (
          <section key={team} className="mt-6">
            <h2 className="mb-3 font-mono text-[12px] font-bold uppercase tracking-[0.2em] text-brand">
              0{teamIndex + 1} · {TEAM_LABELS[team]}
            </h2>
            <div className="flex flex-col gap-3">
              {ROSTER.filter((agent) => agent.team === team).map((agent) => (
                <div key={agent.id} className={GRID}>
                  <div className="flex flex-col justify-center max-sm:col-span-3">
                    <div className="font-display text-[16px] font-semibold">{agent.name}</div>
                    <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-fg-dim">{agent.focus}</div>
                  </div>
                  {STATES.map((state) => (
                    <div
                      key={state.id}
                      className="relative flex h-[128px] items-center justify-center overflow-hidden rounded-2xl border border-line bg-panel sm:h-[156px]"
                    >
                      <div className="max-sm:-translate-y-3 max-sm:scale-[0.62]">
                        <AgentAvatar key={state.id === 'done' ? replay : undefined} id={agent.id} state={state.id} size={120} />
                      </div>
                      <div className="absolute right-2 bottom-2 sm:right-4 sm:bottom-3">
                        <AgentAvatar key={state.id === 'done' ? `small-${replay}` : undefined} id={agent.id} state={state.id} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
