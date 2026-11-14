import type { ReactNode } from 'react'
import { REQ_TYPE, TASK_TYPE, contractOpStatus, nodeKey, parseKey } from '@/entities/run'
import type { RunView, SourceRef } from '@/entities/run'

interface InspectorProps {
  view: RunView
  selected: string | null
  onSelect: (key: string | null) => void
  onGap: (gapId: string | null) => void
  /** Выбранный этап «Хода прогона»: его подробности вместо узла карты. */
  stage?: { kicker: string; title: string; rows: [string, string][] } | null
}

const LEGEND = [
  ['bg-brand', 'покрыт'],
  ['bg-amber', 'нет теста'],
  ['bg-hazard', 'нет задач'],
  ['bg-line-input', 'не задействован'],
] as const

const OP_TEXT = {
  covered: ['Покрыт: есть реализация и интеграционный тест', 'text-brand'],
  no_tests: ['Есть задачи, но нет интеграционного теста', 'text-amber'],
  no_tasks: ['Нужен требованиям, но задач нет', 'text-hazard'],
  unused: ['Не задействован в эпике — подтвердите', 'text-fg-dim'],
  pending: ['Ожидает проверок', 'text-fg-dim'],
} as const

function Block({ title, children, count }: { title: string; children: ReactNode; count?: number }) {
  return (
    <section className="flex flex-col gap-2 border-t border-line px-5 py-4">
      <h3 className="tag flex justify-between text-fg-dim">
        <span>{title}</span>
        {count !== undefined && <span>{count}</span>}
      </h3>
      {children}
    </section>
  )
}

function Chip({ label, onClick, tone = 'fg' }: { label: string; onClick?: () => void; tone?: 'fg' | 'hazard' | 'brand' }) {
  const cls = { fg: 'border-line-strong text-fg-soft', hazard: 'border-hazard/70 text-hazard', brand: 'border-brand/60 text-brand' }[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`press cursor-pointer rounded-[5px] border bg-ink px-1.5 py-0.5 font-mono text-[11px] hover:border-brand hover:text-brand disabled:cursor-default ${cls}`}
    >
      {label}
    </button>
  )
}

function Excerpt({ source, onOpen }: { source: SourceRef; onOpen: () => void }) {
  return (
    <figure className="flex flex-col overflow-hidden rounded-[10px] border border-line bg-ink">
      <figcaption className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5">
        <button type="button" onClick={onOpen} className="press cursor-pointer truncate font-mono text-[11px] font-bold text-brand hover:underline">
          {source.id}
        </button>
        <span className="truncate font-mono text-[10.5px] text-fg-dim">{source.file}</span>
      </figcaption>
      <pre className="max-h-48 overflow-auto px-3 py-2 font-mono text-[11.5px] leading-[1.5] whitespace-pre-wrap text-fg-soft">
        {source.excerpt || source.title}
      </pre>
    </figure>
  )
}

export function Inspector({ view, selected, onSelect, onGap, stage }: InspectorProps) {
  const sourceById = new Map(view.sources.map((s) => [s.id, s]))
  const tasks = view.stories.flatMap((s) => s.tasks.map((t) => ({ story: s, task: t })))
  const pick = (column: Parameters<typeof nodeKey>[0], id: string) => () => onSelect(nodeKey(column, id))
  const refChips = (refs: string[]) => (
    <div className="flex flex-wrap gap-1">
      {refs.map((ref) =>
        sourceById.has(ref) ? (
          <Chip key={ref} label={ref} onClick={pick('source', ref)} />
        ) : (
          <Chip key={ref} label={`${ref} — нет в источниках`} tone="hazard" />
        ),
      )}
    </div>
  )
  const excerpts = (refs: string[]) =>
    refs
      .map((r) => sourceById.get(r))
      .filter((s): s is SourceRef => !!s)
      .map((s) => <Excerpt key={s.id} source={s} onOpen={pick('source', s.id)} />)
  const issuesFor = (id: string) => view.issues.filter((i) => i.target_id === id)

  let head: ReactNode
  let body: ReactNode

  if (stage && !selected) {
    head = <Head kicker={stage.kicker} title={stage.title} />
    body = (
      <Block title="Подробности">
        <dl className="flex flex-col gap-2">
          {stage.rows.map(([k, v]) => (
            <div key={k} className="flex flex-col gap-0.5">
              <dt className="text-[12px] text-fg-dim">{k}</dt>
              <dd className="text-[13px] leading-snug break-words text-fg">{v}</dd>
            </div>
          ))}
        </dl>
      </Block>
    )
  } else if (!selected) {
    head = <Head kicker="Сводка" title="Выберите узел на карте" />
    body = (
      <>
        <Block title="Как читать">
          <p className="text-[13px] leading-relaxed text-fg-muted">Клик по узлу покажет его цепочку обоснования.</p>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-fg-muted">
            {LEGEND.map(([cls, text]) => (
              <li key={text} className="flex items-center gap-1.5">
                <span className={`inline-block size-2 rounded-full ${cls}`} />
                {text}
              </li>
            ))}
          </ul>
        </Block>
        {view.gaps.length > 0 && (
          <Block title="Пробелы и противоречия" count={view.gaps.length}>
            {view.gaps.slice(0, 4).map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => onGap(g.id)}
                className="press cursor-pointer rounded-[10px] border border-hazard/40 bg-hazard-deep/20 px-3 py-2 text-left hover:border-hazard"
              >
                <span className="font-mono text-[11px] font-bold text-hazard">{g.id}</span>
                <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-snug text-fg-soft">{g.text}</span>
              </button>
            ))}
          </Block>
        )}
        {view.assumptions.length > 0 && (
          <Block title="Допущения" count={view.assumptions.length}>
            <ul className="flex flex-col gap-1.5">
              {view.assumptions.map((a) => (
                <li key={a} className="text-[12.5px] leading-snug text-fg-muted">— {a}</li>
              ))}
            </ul>
          </Block>
        )}
      </>
    )
  } else {
    const { column, id } = parseKey(selected)
    if (column === 'source') {
      const s = sourceById.get(id)
      const reqs = view.requirements.filter((r) => r.source_refs.includes(id))
      const users = tasks.filter(({ task }) => task.source_refs.includes(id))
      const gaps = view.gaps.filter((g) => g.source_refs.includes(id))
      const isOp = s && (s.kind === 'proto_rpc' || s.kind === 'openapi_op')
      const status = isOp ? OP_TEXT[contractOpStatus(view, id)] : null
      head = <Head kicker={`Источник · ${s?.kind ?? ''}`} title={id} mono />
      body = s && (
        <>
          {status && (
            <Block title="Покрытие операции">
              <p className={`text-[13px] font-semibold ${status[1]}`}>{status[0]}</p>
            </Block>
          )}
          <Block title={`Фрагмент · ${s.file}`}>
            <pre className="max-h-72 overflow-auto rounded-[10px] border border-line bg-ink px-3 py-2 font-mono text-[11.5px] leading-[1.5] whitespace-pre-wrap text-fg-soft">
              {s.excerpt || s.title}
            </pre>
          </Block>
          {gaps.length > 0 && (
            <Block title="Пробелы" count={gaps.length}>
              {gaps.map((g) => (
                <div key={g.id} className="rounded-[10px] border border-hazard/50 bg-hazard-deep/25 px-3 py-2">
                  <span className="font-mono text-[11px] font-bold text-hazard">{g.id}</span>
                  <p className="mt-1 text-[12.5px] leading-snug text-fg-soft">{g.text}</p>
                  <p className="mt-1 text-[12px] leading-snug text-hazard/90">Риск: {g.risk}</p>
                </div>
              ))}
            </Block>
          )}
          <Block title="Обосновывает требования" count={reqs.length}>
            <div className="flex flex-wrap gap-1">{reqs.map((r) => <Chip key={r.id} label={r.id} onClick={pick('requirement', r.id)} />)}</div>
          </Block>
          <Block title="Задачи ссылаются напрямую" count={users.length}>
            <div className="flex flex-wrap gap-1">{users.map(({ task }) => <Chip key={task.id} label={task.id} onClick={pick('task', task.id)} />)}</div>
          </Block>
        </>
      )
    } else if (column === 'requirement') {
      const r = view.requirements.find((x) => x.id === id)
      const stories = view.stories.filter((s) => s.requirement_ids.includes(id))
      const hit = tasks.filter(({ task }) => task.requirement_ids.includes(id))
      head = <Head kicker={`Требование · ${r ? REQ_TYPE[r.type] : ''}`} title={id} mono />
      body = r && (
        <>
          <Block title="Формулировка">
            <p className="text-[14px] leading-relaxed text-fg">{r.text}</p>
          </Block>
          <Block title="Источники" count={r.source_refs.length}>
            {refChips(r.source_refs)}
            {excerpts(r.source_refs.slice(0, 3))}
          </Block>
          <Block title="Истории" count={stories.length}>
            <div className="flex flex-wrap gap-1">{stories.map((s) => <Chip key={s.id} label={s.id} onClick={pick('story', s.id)} />)}</div>
          </Block>
          <Block title="Задачи" count={hit.length}>
            {hit.length === 0 && <p className="text-[13px] text-hazard">Не покрыто ни одной задачей</p>}
            <div className="flex flex-wrap gap-1">{hit.map(({ task }) => <Chip key={task.id} label={task.id} onClick={pick('task', task.id)} />)}</div>
          </Block>
        </>
      )
    } else if (column === 'story') {
      const s = view.stories.find((x) => x.id === id)
      const note = view.criticNotes.find((n) => n.story_id === id)
      head = <Head kicker="Пользовательская история" title={id} mono />
      body = s && (
        <>
          <Block title="История">
            <p className="text-[14px] leading-relaxed font-semibold text-fg">{s.title}</p>
            {s.description && <p className="text-[13px] leading-relaxed text-fg-muted">{s.description}</p>}
          </Block>
          {note && (
            <Block title="Замечание критика">
              <p className="border-l-2 border-amber pl-3 text-[12.5px] leading-snug text-amber/90">{note.problem}</p>
            </Block>
          )}
          <Block title="Критерии приёмки" count={s.acceptance_criteria.length}>
            <ol className="flex flex-col gap-1.5">
              {s.acceptance_criteria.map((c, i) => (
                <li key={c} className="flex gap-2 text-[12.5px] leading-snug text-fg-soft">
                  <span className="font-mono text-fg-dim">{String(i + 1).padStart(2, '0')}</span>
                  {c}
                </li>
              ))}
            </ol>
          </Block>
          <Block title="Требования" count={s.requirement_ids.length}>
            <div className="flex flex-wrap gap-1">{s.requirement_ids.map((r) => <Chip key={r} label={r} onClick={pick('requirement', r)} />)}</div>
          </Block>
          <Block title="Задачи" count={s.tasks.length}>
            <div className="flex flex-col gap-1">
              {s.tasks.map((t) => (
                <button key={t.id} type="button" onClick={pick('task', t.id)} className="press flex cursor-pointer items-baseline gap-2 text-left hover:text-brand">
                  <span className="font-mono text-[11px] text-fg-dim">{t.id}</span>
                  <span className="text-[12.5px] leading-snug text-fg-soft">{t.title}</span>
                </button>
              ))}
            </div>
          </Block>
        </>
      )
    } else {
      const hit = tasks.find(({ task }) => task.id === id)
      const t = hit?.task
      const type = t ? TASK_TYPE[t.type] : null
      head = <Head kicker={`Задача · ${type?.label ?? ''} · ${hit?.story.id ?? ''}`} title={id} mono />
      body = t && (
        <>
          <Block title="Задача">
            <p className="text-[14px] leading-relaxed font-semibold text-fg">{t.title}</p>
            <p className="text-[13px] leading-relaxed text-fg-muted">{t.description}</p>
          </Block>
          {issuesFor(id).length > 0 && (
            <Block title="Замечания ОТК">
              {issuesFor(id).map((i) => (
                <p key={i.code + i.message} className={`text-[12.5px] ${i.severity === 'error' ? 'text-hazard' : 'text-amber'}`}>
                  {i.message}
                </p>
              ))}
            </Block>
          )}
          <Block title="Обоснование: источники" count={t.source_refs.length}>
            {refChips(t.source_refs)}
            {excerpts(t.source_refs.slice(0, 3))}
          </Block>
          <Block title="Требования" count={t.requirement_ids.length}>
            {t.requirement_ids.length === 0 && <p className="text-[13px] text-hazard">Задача без обоснования требованием</p>}
            {t.requirement_ids.map((rid) => {
              const r = view.requirements.find((x) => x.id === rid)
              return (
                <button key={rid} type="button" onClick={pick('requirement', rid)} className="press cursor-pointer text-left hover:text-brand">
                  <span className="font-mono text-[11px] font-bold text-fg">{rid}</span>{' '}
                  <span className="text-[12.5px] leading-snug text-fg-muted">{r?.text ?? 'нет такого требования'}</span>
                </button>
              )
            })}
          </Block>
          {t.definition_of_done.length > 0 && (
            <Block title="Критерии готовности" count={t.definition_of_done.length}>
              <ul className="flex flex-col gap-1.5">
                {t.definition_of_done.map((dod) => (
                  <li key={dod} className="flex gap-2 text-[12.5px] leading-snug text-fg-soft">
                    <span className="mt-[3px] size-2.5 shrink-0 border border-brand-mid" />
                    {dod}
                  </li>
                ))}
              </ul>
            </Block>
          )}
          {t.test_scenarios.length > 0 && (
            <Block title="Тест-сценарии → кейсы 7/8" count={t.test_scenarios.length}>
              <div className="flex flex-col gap-px overflow-hidden rounded-[10px] border border-line bg-line">
                {t.test_scenarios.map((sc) => (
                  <div key={sc.name + sc.input} className="flex flex-col gap-1 bg-ink px-3 py-2">
                    <span className="text-[12.5px] font-semibold text-amber">{sc.name}</span>
                    <span className="font-mono text-[11px] leading-snug text-fg-muted">вход › {sc.input}</span>
                    <span className="font-mono text-[11px] leading-snug text-fg-soft">ожидаем › {sc.expected}</span>
                  </div>
                ))}
              </div>
            </Block>
          )}
        </>
      )
    }
  }

  return (
    <aside className="flex min-h-0 flex-col border-l border-line bg-ink/90" aria-label="Инспектор">
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        {head}
        {(selected || stage) && (
          <button type="button" onClick={() => onSelect(null)} className="press tag cursor-pointer text-fg-dim hover:text-fg" title="Сбросить выбор">
            esc ×
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">{body}</div>
    </aside>
  )
}

function Head({ kicker, title, mono = false }: { kicker: string; title: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="tag text-brand">{kicker}</span>
      <h2 className={`truncate leading-tight text-fg ${mono ? 'font-mono text-[17px] font-bold' : 'font-display text-[17px] font-semibold tracking-[-0.02em]'}`}>
        {title}
      </h2>
    </div>
  )
}
