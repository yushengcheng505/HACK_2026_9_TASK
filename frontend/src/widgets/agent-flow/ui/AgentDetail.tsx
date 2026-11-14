import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { RunView, SourceKind, StreamRun } from '@/entities/run'
import { AGENT_ABOUT, LIVE_MS, STATUS_LABEL } from '../model/agents'
import type { AgentInstance } from '../model/agents'
import { clock } from '../model/text'
import { BotAvatar } from './BotAvatar'
import { Empty, Findings, Line, Note, Requirements, Section, Stories, Tasks } from './Items'

type Tab = 'input' | 'stream' | 'result' | 'timeline'

const TABS: { id: Tab; label: string }[] = [
  { id: 'input', label: 'Вход' },
  { id: 'stream', label: 'Мысли и ответ' },
  { id: 'result', label: 'Результат' },
  { id: 'timeline', label: 'Хронология' },
]

const SOURCE_KIND: Record<SourceKind, string> = {
  epic: 'эпик',
  doc: 'документация',
  proto_rpc: 'gRPC-метод',
  proto_message: 'сообщение',
  openapi_op: 'REST-операция',
  example: 'пример',
}

interface CallRun extends StreamRun {
  key: string
}

function runsOf(view: RunView, inst: AgentInstance): CallRun[] {
  return inst.callKeys
    .flatMap((key) => (view.calls[key]?.runs ?? []).map((r) => ({ ...r, key })))
    .sort((a, b) => a.startedAt - b.startedAt)
}

const runLabel = (r: CallRun) =>
  r.key === 'skeptic:gaps' ? 'пробелы аналитика' : r.key === 'critic' ? `критик · заход ${r.round}` : `заход ${r.round}`

function decisions(view: RunView): ReactNode {
  const answered = view.questions.filter((q) => q.answer)
  if (!answered.length && !view.assumptions.length) return <Empty>Решений и допущений нет.</Empty>
  return (
    <ul className="af-list">
      {answered.map((q) => (
        <Line key={q.id} id={q.id} tag="ответ">
          {q.text} — <b className="text-fg">{q.answer}</b>
        </Line>
      ))}
      {view.assumptions.map((a, i) => (
        <Line key={a} id={`A-${i + 1}`} tag="допущение">
          {a}
        </Line>
      ))}
    </ul>
  )
}

function InputTab({ view, inst }: { view: RunView; inst: AgentInstance }) {
  const story = view.stories.find((s) => s.id === inst.storyId)
  const storyReqs = story ? view.requirements.filter((r) => story.requirement_ids.includes(r.id)) : []
  switch (inst.kind) {
    case 'requirements': {
      const kinds = Object.entries(
        view.sources.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.kind]: (acc[s.kind] ?? 0) + 1 }), {}),
      )
      return (
        <>
          <Section title="Источники от подготовки" count={view.sources.length}>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {kinds.map(([k, n]) => (
                <span key={k} className="af-line-tag">
                  {SOURCE_KIND[k as SourceKind]} · {n}
                </span>
              ))}
            </div>
            <ul className="af-list">
              {view.sources.slice(0, 60).map((s) => (
                <Line key={s.id} id={s.id}>
                  {s.title}
                </Line>
              ))}
            </ul>
          </Section>
          {view.language?.value && <Section title="Целевой язык">{`${view.language.value} · ${Math.round(view.language.confidence * 100)}%`}</Section>}
        </>
      )
    }
    case 'analyst':
      return (
        <Section title="Требования от Составителя" count={view.requirements.length}>
          <Requirements items={view.requirements} />
        </Section>
      )
    case 'stories':
      return (
        <>
          <Section title="Требования" count={view.requirements.length}>
            <Requirements items={view.requirements} />
          </Section>
          <Section title="Решения по вопросам Аналитика">{decisions(view)}</Section>
        </>
      )
    case 'tasks':
    case 'reviewer': {
      if (!story) return <Empty>История ещё не написана.</Empty>
      const notes = view.feedback.flatMap((f) => f.notes.filter((n) => n.story_id === story.id).map((n) => ({ round: f.round, problem: n.problem })))
      return (
        <>
          <Section title={`История ${story.id}`}>
            <p className="text-[13px] leading-relaxed font-semibold text-fg">{story.title}</p>
            {story.description && <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-muted">{story.description}</p>}
            <ul className="mt-2 flex flex-col gap-1">
              {story.acceptance_criteria.map((c) => (
                <li key={c} className="text-[12px] leading-relaxed text-fg-soft">
                  — {c}
                </li>
              ))}
            </ul>
          </Section>
          {inst.kind === 'tasks' ? (
            <Section title="Требования истории" count={storyReqs.length}>
              <Requirements items={storyReqs} />
            </Section>
          ) : (
            <Section title="Задачи истории на проверку" count={story.tasks.length}>
              {story.tasks.length ? <Tasks items={story.tasks} /> : <Empty>Задач пока нет.</Empty>}
            </Section>
          )}
          {inst.kind === 'tasks' &&
            notes.map((n) => (
              <Note key={n.round} title={`Замечания на доработку · после круга ${n.round}`}>
                {n.problem}
              </Note>
            ))}
        </>
      )
    }
    case 'junction':
    case 'simplifier': {
      const tasks = view.stories.reduce((n, s) => n + s.tasks.length, 0)
      return (
        <Section title="Весь эпик сразу" count={`${view.stories.length} US · ${tasks} TASK`}>
          <ul className="af-list">
            {view.stories.map((s) => (
              <Line key={s.id} id={s.id} tag={`${s.tasks.length} задач`}>
                {s.title}
              </Line>
            ))}
          </ul>
        </Section>
      )
    }
    case 'skeptic': {
      const sent = view.findings.filter((f) => f.verdict !== 'rejected_by_filter')
      const filtered = view.findings.length - sent.length
      return (
        <Section title="Находки на перепроверку" count={sent.length}>
          {filtered > 0 && <p className="mb-2 font-mono text-[11px] text-fg-dim">ещё {filtered} отсеяно фильтром кода до скептика</p>}
          <Findings items={sent} showSource />
        </Section>
      )
    }
  }
}

function ResultTab({ view, inst }: { view: RunView; inst: AgentInstance }) {
  const story = view.stories.find((s) => s.id === inst.storyId)
  switch (inst.kind) {
    case 'requirements':
      return (
        <Section title="Требования" count={view.requirements.length}>
          <Requirements items={view.requirements} />
        </Section>
      )
    case 'analyst': {
      const gaps = view.findings.filter((f) => f.source === 'analyst')
      return (
        <>
          <Section title="Пробелы и вердикты скептика" count={gaps.length || view.gaps.length}>
            {gaps.length ? (
              <Findings items={gaps} />
            ) : (
              <ul className="af-list">
                {view.gaps.map((g) => (
                  <Line key={g.id} id={g.id}>
                    {g.text}
                  </Line>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Вопросы" count={view.questions.length}>
            <ul className="af-list">
              {view.questions.map((q) => (
                <Line key={q.id} id={q.id} tag={q.answer ? 'отвечен' : 'по рекомендации'}>
                  {q.text}
                  <span className="af-line-sub">→ {q.answer ?? q.options[q.recommended]}</span>
                </Line>
              ))}
            </ul>
          </Section>
        </>
      )
    }
    case 'stories':
      return (
        <Section title="Пользовательские истории" count={view.stories.length}>
          <Stories items={view.stories} />
        </Section>
      )
    case 'tasks': {
      if (!story) return <Empty>История ещё не написана.</Empty>
      const retired = view.retired.filter((r) => r.storyId === story.id)
      const rounds = [...new Set(retired.map((r) => r.round))]
      return (
        <>
          <Section title="Задачи сейчас" count={story.tasks.length}>
            {story.tasks.length ? <Tasks items={story.tasks} /> : <Empty>Задач пока нет.</Empty>}
          </Section>
          {rounds.map((round) => (
            <Section key={round} title={`Заменены при доработке · заход ${round}`} count={retired.filter((r) => r.round === round).length}>
              <Tasks items={retired.filter((r) => r.round === round).map((r) => r.task)} dim />
            </Section>
          ))}
        </>
      )
    }
    case 'reviewer':
      return (
        <Section title="Находки по истории">
          <Findings items={view.findings.filter((f) => f.source === 'reviewer' && f.story_ids.includes(inst.storyId ?? ''))} />
        </Section>
      )
    case 'junction':
      return (
        <Section title="Дубли и разрывы">
          <Findings items={view.findings.filter((f) => f.source === 'editor')} />
        </Section>
      )
    case 'simplifier':
      return (
        <Section title="Лишняя работа">
          <Findings items={view.findings.filter((f) => f.source === 'simplifier')} />
        </Section>
      )
    case 'skeptic': {
      const judged = view.findings.filter((f) => ['confirmed', 'downgraded', 'rejected'].includes(f.verdict))
      return (
        <>
          {view.feedback.map((f) => (
            <Note key={f.round} title={`Круг ${f.round}: на доработку ${f.notes.length}`} tone={f.notes.length ? 'amber' : 'brand'}>
              {f.notes.length ? f.notes.map((n) => n.story_id).join(', ') : 'Доработка не нужна'}
            </Note>
          ))}
          <Section title="Вердикты" count={judged.length}>
            <Findings items={judged} showSource />
          </Section>
        </>
      )
    }
  }
}

function StreamTab({ view, inst, now }: { view: RunView; inst: AgentInstance; now: number }) {
  const runs = useMemo(() => runsOf(view, inst), [view, inst])
  const [picked, setPicked] = useState<number | null>(null)
  const index = picked ?? runs.length - 1
  const run = runs[index]
  const box = useRef<HTMLDivElement>(null)
  const live = run ? now - run.lastAt < LIVE_MS && index === runs.length - 1 : false

  useEffect(() => {
    if (live) box.current?.scrollTo({ top: box.current.scrollHeight })
  }, [live, run?.content.length, run?.reasoning.length])

  if (!run) return <Empty>Агент ещё не вызывался.</Empty>
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {runs.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {runs.map((r, i) => (
            <button key={`${r.key}-${r.round}`} type="button" onClick={() => setPicked(i)} className={`af-pill ${i === index ? 'af-pill-on' : ''}`}>
              {runLabel(r)}
            </button>
          ))}
        </div>
      )}
      <div ref={box} className="af-stream min-h-0 flex-1 overflow-y-auto">
        {run.trimmed && <p className="mb-2 font-mono text-[10.5px] text-fg-dim">… начало потока обрезано</p>}
        {run.reasoning && (
          <>
            <div className="af-stream-label">рассуждение</div>
            <pre className="af-stream-text text-fg-dim italic">{run.reasoning}</pre>
          </>
        )}
        {run.content && (
          <>
            <div className="af-stream-label">ответ модели</div>
            <pre className="af-stream-text text-mint">{run.content}</pre>
          </>
        )}
        {live && <span className="af-caret" />}
      </div>
    </div>
  )
}

function TimelineTab({ view, inst }: { view: RunView; inst: AgentInstance }) {
  const t0 = view.startedAt ?? 0
  const runs = runsOf(view, inst)
  const retries = inst.callKeys.flatMap((k) => view.calls[k]?.retries ?? [])
  const failure = inst.callKeys.map((k) => view.calls[k]?.failure).find(Boolean)
  const items: { at: number; text: string; tone?: string }[] = [
    ...runs.flatMap((r) => [
      { at: r.startedAt, text: `${runLabel(r)}: начал отвечать` },
      { at: r.lastAt, text: `${runLabel(r)}: ${clock(r.lastAt - r.startedAt)} в работе, ${(r.reasoning.length + r.content.length).toLocaleString('ru')} симв.` },
    ]),
    ...retries.map((r) => ({ at: r.at, text: `повтор запроса, попытка ${r.attempt}: ${r.reason}`, tone: 'text-amber' })),
  ].sort((a, b) => a.at - b.at)

  if (!items.length && !failure) return <Empty>Событий пока нет.</Empty>
  return (
    <ol className="af-timeline">
      {items.map((item, i) => (
        <li key={i} className={item.tone}>
          <span className="af-timeline-at">+{clock(item.at - t0)}</span>
          <span>{item.text}</span>
        </li>
      ))}
      {failure && (
        <li className="text-hazard">
          <span className="af-timeline-at">сбой</span>
          <span>{failure}</span>
        </li>
      )}
    </ol>
  )
}

interface AgentDetailProps {
  view: RunView
  inst: AgentInstance
  now: number
}

/** Карточка агента: с чем пришёл, что думает, что выдал и когда. */
export function AgentDetail({ view, inst, now }: AgentDetailProps) {
  const [tab, setTab] = useState<Tab>(inst.status === 'working' ? 'stream' : 'result')
  const runs = runsOf(view, inst)
  const active = runs.reduce((ms, r) => ms + (r.lastAt - r.startedAt), 0)
  const retries = inst.callKeys.reduce((n, k) => n + (view.calls[k]?.retries.length ?? 0), 0)
  const story = view.stories.find((s) => s.id === inst.storyId)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="af-detail-head">
        <span className={`af-bot shrink-0 ${inst.status === 'working' ? 'af-bob' : ''}`}>
          <BotAvatar kind={inst.kind} status={inst.status} size={84} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[18px] leading-tight font-bold text-fg">{inst.name}</h2>
            {inst.storyId && <span className="af-line-id">{inst.storyId}</span>}
          </div>
          <span className={`af-status-pill af-status-${inst.status}`}>
            <i className="af-dot" />
            {STATUS_LABEL[inst.status]}
          </span>
          {story && <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-fg-muted">{story.title}</p>}
        </div>
      </div>
      <p className="px-5 text-[12.5px] leading-relaxed text-fg-muted">{AGENT_ABOUT[inst.kind]}</p>
      <dl className="af-stats">
        <div>
          <dt>заходов</dt>
          <dd>{runs.length}</dd>
        </div>
        <div>
          <dt>в работе</dt>
          <dd title={active ? undefined : 'Время есть только при живом прогоне или воспроизведении записи'}>{active ? clock(active) : '—'}</dd>
        </div>
        <div>
          <dt>повторов</dt>
          <dd className={retries ? 'text-amber' : ''}>{retries}</dd>
        </div>
      </dl>

      <div role="tablist" className="af-tabs">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`af-tab ${tab === t.id ? 'af-tab-on' : ''}`}>
            {t.label}
            {t.id === 'stream' && inst.status === 'working' && <i className="af-dot af-dot-live" />}
          </button>
        ))}
      </div>
      <div className={`af-detail-body ${tab === 'stream' ? 'flex flex-col' : ''}`}>
        {tab === 'input' && <InputTab view={view} inst={inst} />}
        {tab === 'stream' && <StreamTab view={view} inst={inst} now={now} />}
        {tab === 'result' && <ResultTab view={view} inst={inst} />}
        {tab === 'timeline' && <TimelineTab view={view} inst={inst} />}
      </div>
    </div>
  )
}
