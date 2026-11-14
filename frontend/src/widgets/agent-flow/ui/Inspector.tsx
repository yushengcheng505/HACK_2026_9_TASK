import type { ReactNode } from 'react'
import { PIPELINE, TASK_TYPE, shortOp } from '@/entities/run'
import type { PipelineNode, RunView } from '@/entities/run'
import { exportUrl } from '@/shared/api'
import { routeHref } from '@/shared/lib/useHashRoute'
import { STATUS_LABEL, lastRun } from '../model/agents'
import type { AgentInstance } from '../model/agents'
import { liveLine } from '../model/text'
import { AgentDetail } from './AgentDetail'
import { BotAvatar } from './BotAvatar'
import { Empty, Line, Section } from './Items'

/** Какой узел графа открыть по шагу конвейера. */
const NODE_TARGET: Record<PipelineNode, string> = {
  parse_inputs: 'prep',
  detect_language: 'prep',
  requirements: 'requirements',
  analyst: 'analyst',
  ask_user: 'analyst',
  stories: 'stories',
  tasks: 'tasks',
  checks: 'gate',
  critic: 'skeptic',
  finalize: 'result',
}

function Panel({ title, onBack, children }: { title: string; onBack?: () => void; children: ReactNode }) {
  return (
    <aside className="af-inspector" aria-label="Инспектор">
      <div className="af-inspector-bar">
        {onBack ? (
          <button type="button" onClick={onBack} className="af-back press">
            ← все агенты
          </button>
        ) : (
          <span className="font-mono text-[10.5px] tracking-[0.16em] text-fg-dim uppercase">{title}</span>
        )}
      </div>
      {children}
    </aside>
  )
}

function Overview({ view, instances, onSelect }: { view: RunView; instances: AgentInstance[]; onSelect: (k: string) => void }) {
  const order = { working: 0, waiting: 1, queued: 2 } as Record<string, number>
  const busy = instances.filter((i) => i.status in order).sort((a, b) => order[a.status] - order[b.status])
  const tasksTarget = view.stories[0] ? `tasks:${view.stories[0].id}` : 'stories'

  return (
    <div className="af-detail-body">
      <Section title="Сейчас работают" count={busy.length}>
        {busy.length === 0 && (
          <Empty>
            {view.status === 'done'
              ? 'Прогон завершён. Нажмите на любого агента, чтобы увидеть, что он получил и что выдал.'
              : view.status === 'failed'
                ? `Прогон прерван: ${view.error ?? 'сбой'}`
                : view.activeNode
                  ? 'Сейчас работает код — без агентов.'
                  : 'Агенты ждут начала прогона.'}
          </Empty>
        )}
        <ul className="flex flex-col gap-1.5">
          {busy.map((inst) => {
            const line = liveLine(lastRun(view, inst.callKeys))
            return (
              <li key={inst.key}>
                <button type="button" onClick={() => onSelect(inst.key)} className={`af-busy af-status-${inst.status}`}>
                  <span className={`af-bot shrink-0 ${inst.status === 'working' ? 'af-bob' : ''}`}>
                    <BotAvatar kind={inst.kind} status={inst.status} size={40} />
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="flex items-center gap-2">
                      <b className="text-[13px] text-fg">{inst.name}</b>
                      {inst.storyId && <span className="af-line-id">{inst.storyId}</span>}
                      <span className="ml-auto font-mono text-[10px] text-fg-dim uppercase">{STATUS_LABEL[inst.status]}</span>
                    </span>
                    {inst.status === 'working' && line && (
                      <span className={`mt-1 block truncate font-mono text-[11px] ${line.thinking ? 'text-fg-dim italic' : 'text-mint'}`}>{line.text}</span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </Section>

      <Section title="Ход конвейера">
        <ol className="af-steps">
          {PIPELINE.filter((p) => p.node !== 'ask_user' || view.nodes.ask_user.phase !== 'idle').map((p) => {
            const state = view.nodes[p.node]
            const target = p.node === 'tasks' ? tasksTarget : NODE_TARGET[p.node]
            return (
              <li key={p.node}>
                <button type="button" onClick={() => onSelect(target)} className={`af-step af-step-${state.phase}`}>
                  <i />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="flex items-baseline gap-2">
                      <b>{p.label}</b>
                      {state.visits > 1 && <span className="font-mono text-[10.5px] text-amber">×{state.visits}</span>}
                    </span>
                    {state.summary && <span className="block truncate font-mono text-[10.5px] text-fg-dim">{state.summary}</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </Section>
    </div>
  )
}

function PrepDetail({ view }: { view: RunView }) {
  const ops = view.sources.filter((s) => s.kind === 'proto_rpc' || s.kind === 'openapi_op')
  return (
    <div className="af-detail-body">
      <p className="mb-4 text-[12.5px] leading-relaxed text-fg-muted">
        Детерминированный шаг: код режет эпик, документацию и контракты на фрагменты с ID, по признакам в файлах оценивает целевой язык. Агенты получают
        только эти фрагменты и ссылаются на их ID.
      </p>
      <Section title="Целевой язык">
        {view.language ? (
          <>
            <p className="text-[14px] font-semibold text-fg">
              {view.language.value ?? 'не определён'} · {Math.round(view.language.confidence * 100)}%
            </p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {view.language.evidence.map((e) => (
                <li key={e} className="font-mono text-[11.5px] text-fg-soft">
                  › {e}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <Empty>Ещё не определён.</Empty>
        )}
      </Section>
      <Section title="Операции контракта" count={ops.length}>
        <ul className="af-list">
          {ops.map((s) => (
            <Line key={s.id} id={shortOp(s).name} tag={s.kind === 'openapi_op' ? 'REST' : 'gRPC'}>
              {shortOp(s).scope}
            </Line>
          ))}
        </ul>
      </Section>
      <Section title="Фрагменты" count={view.sources.length}>
        <ul className="af-list">
          {view.sources.map((s) => (
            <Line key={s.id} id={s.id}>
              {s.title}
            </Line>
          ))}
        </ul>
      </Section>
    </div>
  )
}

function GateDetail({ view }: { view: RunView }) {
  const c = view.coverage
  return (
    <div className="af-detail-body">
      <p className="mb-4 text-[12.5px] leading-relaxed text-fg-muted">
        ОТК — проверки кодом после каждой генерации задач: покрытие требований, ссылки на контракт, дубли. Замечания уходят проверяющим подсказками.
      </p>
      {c ? (
        <>
          <dl className="af-stats mb-4 px-0">
            <div>
              <dt>покрытие</dt>
              <dd className="text-brand">{Math.round(c.coverage_percent)}%</dd>
            </div>
            <div>
              <dt>операций</dt>
              <dd>
                {c.contract_ops_used.length}/{c.contract_ops_used.length + c.contract_ops_unused.length}
              </dd>
            </div>
            <div>
              <dt>заходов</dt>
              <dd>{view.nodes.checks.visits}</dd>
            </div>
          </dl>
          <Section title="Замечания" count={view.issues.length}>
            {view.issues.length ? (
              <ul className="af-list">
                {view.issues.map((i, n) => (
                  <Line key={`${i.code}-${i.target_id}-${n}`} id={i.target_id} tag={i.severity}>
                    {i.message}
                  </Line>
                ))}
              </ul>
            ) : (
              <Empty>Замечаний нет.</Empty>
            )}
          </Section>
        </>
      ) : (
        <Empty>ОТК ещё не запускался.</Empty>
      )}
    </div>
  )
}

function ResultDetail({ view }: { view: RunView }) {
  const ready = view.status === 'done'
  const byType = view.stories.flatMap((s) => s.tasks).reduce<Record<string, number>>((acc, t) => ({ ...acc, [t.type]: (acc[t.type] ?? 0) + 1 }), {})
  return (
    <div className="af-detail-body">
      <dl className="af-stats mb-4 px-0">
        <div>
          <dt>требований</dt>
          <dd>{view.requirements.length}</dd>
        </div>
        <div>
          <dt>историй</dt>
          <dd>{view.stories.length}</dd>
        </div>
        <div>
          <dt>задач</dt>
          <dd className="text-brand">{view.stories.reduce((n, s) => n + s.tasks.length, 0)}</dd>
        </div>
      </dl>
      <Section title="Задачи по типам">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(byType).map(([type, n]) => (
            <span key={type} className="af-line-tag">
              {TASK_TYPE[type]?.label ?? type} · {n}
            </span>
          ))}
        </div>
      </Section>
      <Section title="Проверка" count={view.criticRound ? `${view.criticRound} кр.` : undefined}>
        <p className="text-[12.5px] leading-relaxed text-fg-soft">
          Находок {view.review.found}, отсеяно кодом {view.review.filtered}; скептик подтвердил {view.review.confirmed}, понизил {view.review.downgraded}, отклонил{' '}
          {view.review.rejected}.
        </p>
      </Section>
      <div className="mt-2 flex flex-wrap gap-2">
        <a href={routeHref({ name: 'run', id: view.runId, mode: 'pult' })} className="af-cta press">
          Открыть в пульте →
        </a>
        {(['docx', 'xlsx', 'json'] as const).map((fmt) => (
          <a key={fmt} href={ready ? exportUrl(view.runId, fmt) : undefined} aria-disabled={!ready} className={`af-pill uppercase ${ready ? '' : 'opacity-40'}`}>
            {fmt}
          </a>
        ))}
      </div>
    </div>
  )
}

interface InspectorProps {
  view: RunView
  instances: AgentInstance[]
  selected: string | null
  onSelect: (key: string | null) => void
  now: number
}

export function Inspector({ view, instances, selected, onSelect, now }: InspectorProps) {
  const back = () => onSelect(null)
  if (selected === 'prep') return <Panel title="Подготовка" onBack={back}><PrepHeader title="Подготовка" sub="код, без агентов" /><PrepDetail view={view} /></Panel>
  if (selected === 'gate') return <Panel title="ОТК" onBack={back}><PrepHeader title="ОТК" sub="проверки кодом" /><GateDetail view={view} /></Panel>
  if (selected === 'result') return <Panel title="Итог" onBack={back}><PrepHeader title="Итог" sub={view.status === 'done' ? 'готово' : 'собирается'} /><ResultDetail view={view} /></Panel>
  const inst = selected ? instances.find((i) => i.key === selected) : undefined
  if (inst) {
    return (
      <Panel title={inst.name} onBack={back}>
        <AgentDetail key={inst.key} view={view} inst={inst} now={now} />
      </Panel>
    )
  }
  return (
    <Panel title="Агенты">
      <Overview view={view} instances={instances} onSelect={onSelect} />
    </Panel>
  )
}

function PrepHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="px-5 pt-4 pb-2">
      <h2 className="text-[18px] font-bold text-fg">{title}</h2>
      <span className="font-mono text-[10.5px] tracking-[0.12em] text-fg-dim uppercase">{sub}</span>
    </div>
  )
}
