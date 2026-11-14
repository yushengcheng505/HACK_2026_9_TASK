import { useEffect, useState } from 'react'
import type { PromptInfo } from '@/features/edit-prompts'
import { listPrompts, resetPrompt, savePrompt } from '@/features/edit-prompts'
import type { AgentState, AgentTeam } from '@/entities/agent'
import { AGENTS, AgentAvatar, TEAM_LABELS } from '@/entities/agent'

const ROLES: Record<string, string> = {
  requirements: 'Составитель требований',
  analyst: 'Аналитик',
  stories: 'Автор историй',
  tasks: 'Генератор задач',
  reviewer: 'Рецензент',
  junction: 'Редактор стыков',
  simplifier: 'Упрощатель',
  skeptic: 'Скептик',
  critic: 'Критик · старый режим',
}

const cardClass = 'rounded-[28px] border border-line bg-surface shadow-[0_30px_80px_rgba(0,0,0,0.45)]'

type GroupId = AgentTeam | 'other'

const GROUPS: { id: GroupId; label: string }[] = [
  { id: 'decomposition', label: TEAM_LABELS.decomposition },
  { id: 'review', label: TEAM_LABELS.review },
  { id: 'other', label: 'Прочее' },
]

const agentOf = (name: string) => AGENTS.find((agent) => agent.id === name)
const groupOf = (name: string): GroupId => agentOf(name)?.team ?? 'other'

export function PromptsPanel() {
  const [prompts, setPrompts] = useState<PromptInfo[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const current = prompts?.find((p) => p.name === selected) ?? null
  const dirty = current !== null && draft !== current.text

  useEffect(() => {
    listPrompts()
      .then((all) => {
        const order = Object.keys(ROLES)
        const rank = (name: string) => (order.includes(name) ? order.indexOf(name) : order.length)
        const list = [...all].sort((a, b) => rank(a.name) - rank(b.name))
        setPrompts(list)
        if (list[0]) {
          setSelected(list[0].name)
          setDraft(list[0].text)
        }
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  const pick = (p: PromptInfo) => {
    if (dirty && !window.confirm('Есть несохранённые правки. Уйти без сохранения?')) return
    setSelected(p.name)
    setDraft(p.text)
    setError(null)
  }

  const apply = async (action: () => Promise<PromptInfo>) => {
    setBusy(true)
    setError(null)
    try {
      const next = await action()
      setPrompts((list) => list?.map((p) => (p.name === next.name ? next : p)) ?? null)
      setDraft(next.text)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const groups = GROUPS.map((group) => ({ ...group, items: (prompts ?? []).filter((p) => groupOf(p.name) === group.id) })).filter(
    (group) => group.items.length > 0,
  )
  const currentAgent = current ? agentOf(current.name) : undefined

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-ink lg:overflow-hidden">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-8 pt-7 pb-6">
        <h1 className="m-0 font-display text-[clamp(26px,2.6vw,40px)] leading-[1.12] font-semibold tracking-[-0.01em]">
          Системные промпты.
          <br />
          <span className="text-brand">У каждого агента свой голос.</span>
        </h1>
        <div className="flex flex-col items-start gap-3">
          <p className="m-0 max-w-[380px] text-[14px] leading-[1.6] text-fg-muted">
            Правка действует на следующие прогоны. Версия промпта записывается в каждый прогон.
          </p>
          <div className="flex items-center gap-1" aria-hidden="true">
            {AGENTS.map((agent) => (
              <AgentAvatar key={agent.id} id={agent.id} size={24} state={busy && agent.id === selected ? 'working' : 'waiting'} />
            ))}
          </div>
        </div>
      </header>

      <div className="grid gap-6 px-8 pb-8 lg:min-h-0 lg:flex-1 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className={`${cardClass} flex flex-col overflow-hidden lg:min-h-0`} aria-labelledby="roles-title">
          <div className="flex items-baseline justify-between gap-4 px-6 pt-6 pb-4">
            <h2 id="roles-title" className="font-display text-[19px] font-semibold text-fg">
              Роли
            </h2>
            <span className="font-mono text-[12px] text-fg-dim">{prompts === null ? '…' : `${prompts.length} шт.`}</span>
          </div>
          <nav className="flex min-h-0 flex-1 flex-col gap-5 px-4 pb-6 lg:overflow-y-auto" aria-label="Промпты">
            {prompts === null && !error && <div className="h-64 shrink-0 animate-pulse rounded-[22px] border border-line bg-panel" />}
            {groups.map((group) => (
              <div key={group.id} className="flex flex-col gap-1.5">
                <span className="px-2 pb-1 font-mono text-[11px] tracking-[0.08em] text-fg-dim uppercase">{group.label}</span>
                {group.items.map((p) => {
                  const active = p.name === selected
                  return (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => pick(p)}
                      className={`press flex cursor-pointer items-center gap-3 rounded-[18px] border px-3 py-2.5 text-left transition-[border-color,background-color,box-shadow] duration-150 ${
                        active
                          ? 'border-brand/70 bg-panel shadow-[0_0_0_1px_rgb(1_222_130/0.25),0_0_28px_rgb(1_222_130/0.08)]'
                          : 'border-transparent hover:border-line-strong hover:bg-panel'
                      }`}
                    >
                      <RoleMark name={p.name} size={32} state={busy && active ? 'working' : 'waiting'} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[14px] font-semibold text-fg">{ROLES[p.name] ?? p.name}</span>
                        <span className="truncate font-mono text-[11px] text-fg-dim">{p.name}.md</span>
                      </span>
                      {p.overridden && <span className="size-2 shrink-0 rounded-full bg-amber" title="изменён" />}
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>
        </section>

        {current ? (
          <section className={`${cardClass} flex min-h-[560px] flex-col gap-4 p-6 lg:min-h-0`} aria-labelledby="prompt-title">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <RoleMark name={current.name} size={48} state={busy ? 'working' : 'waiting'} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <h2 id="prompt-title" className="font-display text-[19px] font-semibold text-fg">
                  {ROLES[current.name] ?? current.name}
                </h2>
                <span className="font-mono text-[12px] text-fg-dim">
                  {currentAgent ? `${TEAM_LABELS[currentAgent.team]} · ищет ${currentAgent.focus}` : 'вне команды'}
                </span>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {current.overridden && (
                  <span className="rounded-full bg-amber-deep px-2.5 py-0.5 font-mono text-[11px] font-bold text-amber">изменён</span>
                )}
                <span className="rounded-full border border-line-strong px-2.5 py-0.5 font-mono text-[11px] text-fg-dim">
                  версия {current.version}
                </span>
                <span className="rounded-full border border-line-strong px-2.5 py-0.5 font-mono text-[11px] text-fg-dim">
                  {draft.length} симв.
                </span>
              </div>
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              aria-label={`Промпт ${current.name}`}
              className="min-h-[420px] w-full flex-1 resize-none rounded-2xl border border-line-input bg-ink px-4 py-3.5 font-mono text-[12.5px] leading-[1.65] text-fg-soft transition-colors duration-150 focus:border-brand lg:min-h-0"
            />
            {error && (
              <p className="m-0 rounded-2xl border border-hazard/60 bg-hazard-deep/40 px-4 py-3 font-mono text-[13px] text-hazard">{error}</p>
            )}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={!dirty || busy || !draft.trim()}
                onClick={() => apply(() => savePrompt(current.name, draft))}
                className="press inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-brand px-5 font-display text-[13px] font-semibold text-ink hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                Сохранить
              </button>
              {dirty && (
                <button
                  type="button"
                  onClick={() => setDraft(current.text)}
                  className="press inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line-input px-5 font-display text-[13px] font-semibold text-fg hover:border-brand hover:text-brand"
                >
                  Отменить правки
                </button>
              )}
              {current.overridden && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => apply(() => resetPrompt(current.name))}
                  className="press ml-auto inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line-input px-5 font-display text-[13px] font-semibold text-fg-soft hover:border-amber hover:text-amber disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Сбросить к исходному
                </button>
              )}
            </div>
          </section>
        ) : (
          error && (
            <div className="self-start rounded-2xl border border-hazard/60 bg-hazard-deep/40 px-4 py-3 font-mono text-[13px] text-hazard">
              {error}
            </div>
          )
        )}
      </div>
    </div>
  )
}

interface RoleMarkProps {
  name: string
  size: number
  state: AgentState
}

function RoleMark({ name, size, state }: RoleMarkProps) {
  const agent = agentOf(name)
  if (agent) return <AgentAvatar id={agent.id} size={size} state={state} />
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-full border border-line-strong bg-ink font-mono text-[11px] text-fg-dim uppercase"
    >
      {name.slice(0, 2)}
    </span>
  )
}
