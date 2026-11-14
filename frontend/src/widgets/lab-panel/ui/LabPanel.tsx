import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { RunRecord, Task } from '@/entities/run'
import { ApiError, api } from '@/shared/api'
import { routeHref } from '@/shared/lib/useHashRoute'
import { Button } from '@/shared/ui/Button'

interface AnalystItem {
  id: string
  story: string
  text: string
}

interface LabMatch {
  analyst_id: string
  task_id: string
  note: string
}

interface LabResult {
  items: AnalystItem[]
  matches: LabMatch[]
  missed_by_analyst: string[]
  analyst_only: string[]
  requirements_missed: string[]
  contract_ops_missed: string[]
  contract_tests_missed: string[]
  coverage_percent: number
  recommendations: string[]
}

const cardClass = 'rounded-[28px] border border-line bg-surface shadow-[0_30px_80px_rgba(0,0,0,0.45)]'
const fieldClass =
  'min-h-12 w-full rounded-2xl border border-line-input bg-ink px-4 text-[14px] text-fg focus:border-brand disabled:cursor-not-allowed disabled:opacity-60'
const captionClass = 'font-mono text-[12px] tracking-[0.1em] text-fg-dim uppercase'
const disabledClass = 'disabled:cursor-not-allowed disabled:opacity-50'

export function LabPanel() {
  const [runs, setRuns] = useState<RunRecord[] | null>(null)
  const [selected, setSelected] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api.get<RunRecord[]>('/runs').then((list) => {
      if (!alive) return
      const done = list.filter((run) => run.status === 'done')
      setRuns(done)
      setSelected(done[0]?.id ?? '')
    }).catch((e: Error) => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [])

  const current = runs?.find((run) => run.id === selected)

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-ink">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-8 pt-7 pb-6">
        <h1 className="m-0 font-display text-[clamp(26px,2.6vw,40px)] leading-[1.12] font-semibold tracking-[-0.01em]">
          Лаборатория.
          <br />
          <span className="text-brand">Сверка с аналитиком.</span>
        </h1>
        <p className="m-0 max-w-[380px] text-[14px] leading-[1.6] text-fg-muted">
          Сопоставьте две разбивки: что совпало, какие требования пропущены и какая работа выходит за рамки эпика.
        </p>
      </header>
      <div className="flex flex-col gap-6 px-8 pb-8">
        <section className={`${cardClass} flex flex-col gap-3 p-6`} aria-label="Выбор запуска">
          <label className="flex flex-col gap-2">
            <span className={captionClass}>Завершённый запуск</span>
            <select value={selected} onChange={(e) => setSelected(e.target.value)} disabled={!runs?.length} className={fieldClass}>
              {!runs?.length && <option value="">{runs === null ? 'Загрузка…' : 'Нет завершённых запусков'}</option>}
              {runs?.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.title} · {new Date(run.created_at * 1000).toLocaleString('ru-RU')} · {run.id}
                </option>
              ))}
            </select>
          </label>
          {runs?.length === 0 && (
            <p className="m-0 text-[14px] text-fg-muted">
              Сначала завершите <a href={routeHref({ name: 'launch' })} className="text-brand underline">запуск агента</a>, затем сравните его с разбивкой аналитика.
            </p>
          )}
        </section>
        {error && <ErrorMessage message={error} />}
        {current && <Comparison key={current.id} selected={current} />}
      </div>
    </div>
  )
}

function Comparison({ selected }: { selected: RunRecord }) {
  const [run, setRun] = useState<RunRecord | null>(null)
  const [reference, setReference] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<LabResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const upload = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    api.get<RunRecord>(`/runs/${selected.id}`).then((value) => {
      if (alive) setRun(value)
    }).catch((e: Error) => { if (alive) setError(e.message) })
    if (selected.demo_id) {
      api.get<{ text: string }>(`/demos/${selected.demo_id}/reference`).then((value) => {
        if (alive) setReference(value.text)
      }).catch((e: Error) => {
        if (alive && !(e instanceof ApiError && e.status === 404)) setError(e.message)
      })
    }
    return () => { alive = false }
  }, [selected.id, selected.demo_id])

  const replaceText = (value: string) => {
    setText(value)
    setFile(null)
    if (upload.current) upload.current.value = ''
    setResult(null)
    setError(null)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setResult(null)
    const form = new FormData()
    if (file) form.append('file', file)
    else form.append('text', text)
    try {
      setResult(await api.form<LabResult>(`/runs/${selected.id}/lab`, form))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <form onSubmit={submit} className={`${cardClass} flex flex-col gap-5 p-6`} aria-labelledby="analyst-title" aria-busy={busy}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="analyst-title" className="font-display text-[19px] font-semibold text-fg">Разбивка аналитика</h2>
          {reference !== null && (
            <Button variant="ghost" disabled={busy} onClick={() => replaceText(reference)} className={disabledClass}>
              Подставить эталон демо
            </Button>
          )}
        </div>
        <label className="flex flex-col gap-2">
          <span className={captionClass}>Текст или список задач</span>
          <textarea
            value={text}
            onChange={(e) => replaceText(e.target.value)}
            disabled={busy}
            rows={7}
            placeholder={'## История\n- Реализовать вызов сервиса\n- Проверить успешный ответ'}
            className={`${fieldClass} resize-y py-3 leading-relaxed placeholder:text-fg-dim/60`}
          />
        </label>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <label className="flex min-w-0 flex-col gap-2">
            <span className={captionClass}>Или файл .md / .txt / .xlsx</span>
            <input
              ref={upload}
              type="file"
              accept=".md,.txt,.xlsx"
              disabled={busy}
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); setError(null) }}
              className="max-w-full text-[13px] text-fg-muted file:mr-3 file:cursor-pointer file:rounded-full file:border file:border-line-input file:bg-panel file:px-4 file:py-2 file:text-fg"
            />
            {file && <span className="text-[12px] text-fg-dim">Будет сравнен файл, а не текст выше.</span>}
          </label>
          <Button type="submit" disabled={busy || !run?.result || (!file && !text.trim())} className={disabledClass}>
            {busy ? 'Сравниваю…' : 'Сравнить'}
          </Button>
        </div>
        {busy && <p role="status" className="m-0 text-[13px] text-fg-muted">Модель сопоставляет задачи. Покрытие и рекомендации рассчитываются кодом.</p>}
        {!run && !error && <p role="status" className="m-0 text-[13px] text-fg-dim">Загружаю задачи запуска…</p>}
        {error && <ErrorMessage message={error} />}
      </form>
      {result && run?.result && <ComparisonResult result={result} tasks={run.result.stories.flatMap((story) => story.tasks)} />}
    </>
  )
}

function ComparisonResult({ result, tasks }: { result: LabResult; tasks: Task[] }) {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const matchedItems = result.items.filter((item) => result.matches.some((match) => match.analyst_id === item.id))
  const onlyItems = result.items.filter((item) => result.analyst_only.includes(item.id))

  return (
    <div className="flex flex-col gap-6" aria-label="Результат сверки" aria-live="polite">
      <section className={`${cardClass} flex flex-wrap items-center gap-x-8 gap-y-4 p-7`} aria-label="Покрытие требований">
        <span className="font-display text-[clamp(48px,6vw,80px)] leading-none font-semibold tracking-tight text-brand">{result.coverage_percent}%</span>
        <div>
          <h2 className="font-display text-[19px] font-semibold text-fg">требований покрыто аналитиком</h2>
          <p className="mt-2 max-w-[580px] text-[13px] leading-relaxed text-fg-muted">
            Хотя бы одна задача требования совпала. В расчёте — требования, для которых у агента есть задачи; частичное покрытие не означает полноту разбивки.
          </p>
          {result.requirements_missed.length > 0 && (
            <p className="mt-2 font-mono text-[12px] text-amber">Без совпадений: {result.requirements_missed.join(', ')}</p>
          )}
        </div>
      </section>
      <div className="grid items-start gap-6 xl:grid-cols-3">
        <ResultColumn title="Совпало" count={matchedItems.length} tone="text-brand">
          {matchedItems.map((item) => (
            <li key={item.id} className="rounded-[18px] border border-line bg-panel p-4">
              <AnalystText item={item} />
              <ul className="mt-4 flex flex-col gap-3 border-l border-brand/40 pl-3">
                {result.matches.filter((match) => match.analyst_id === item.id).map((match) => (
                  <li key={match.task_id}>
                    <TaskText id={match.task_id} task={byId.get(match.task_id)} />
                    {match.note && <p className="mt-1 text-[12px] leading-relaxed text-fg-dim">{match.note}</p>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ResultColumn>
        <ResultColumn title="Пропустил аналитик" count={result.missed_by_analyst.length} tone="text-amber">
          {result.missed_by_analyst.map((id) => (
            <li key={id} className="rounded-[18px] border border-line bg-panel p-4"><TaskText id={id} task={byId.get(id)} /></li>
          ))}
        </ResultColumn>
        <ResultColumn title="Есть только у аналитика" count={onlyItems.length} tone="text-fg-muted">
          {onlyItems.map((item) => (
            <li key={item.id} className="rounded-[18px] border border-line bg-panel p-4"><AnalystText item={item} /></li>
          ))}
        </ResultColumn>
      </div>
      <section className={`${cardClass} p-6`} aria-labelledby="lab-contracts">
        <h2 id="lab-contracts" className="font-display text-[19px] font-semibold text-fg">Методы контракта: пропуски аналитика</h2>
        {result.contract_ops_missed.length + result.contract_tests_missed.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-2">
            {result.contract_ops_missed.map((op) => (
              <li key={`op-${op}`} className="rounded-2xl border border-line bg-panel px-4 py-3 text-[13px] break-words">
                <span className="font-mono text-amber">{op}</span> <span className="text-fg-dim">— нет задач</span>
              </li>
            ))}
            {result.contract_tests_missed.map((op) => (
              <li key={`test-${op}`} className="rounded-2xl border border-line bg-panel px-4 py-3 text-[13px] break-words">
                <span className="font-mono text-amber">{op}</span> <span className="text-fg-dim">— нет интеграционного теста</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-[13px] text-fg-dim">Пропущенных методов нет.</p>}
      </section>
      <section className={`${cardClass} p-6`} aria-labelledby="lab-recommendations">
        <h2 id="lab-recommendations" className="font-display text-[19px] font-semibold text-fg">Рекомендации</h2>
        {result.recommendations.length > 0 ? (
          <ol className="mt-4 flex list-decimal flex-col gap-3 pl-5 text-[14px] leading-relaxed break-words text-fg-muted marker:font-mono marker:text-brand">
            {result.recommendations.map((note, index) => <li key={index} className="pl-2">{note}</li>)}
          </ol>
        ) : <p className="mt-3 text-[13px] text-fg-dim">Пропусков и лишних пунктов не найдено.</p>}
      </section>
    </div>
  )
}

function ResultColumn({ title, count, tone, children }: { title: string; count: number; tone: string; children: ReactNode }) {
  return (
    <section className={`${cardClass} min-w-0 p-5`} aria-label={title}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className={`font-display text-[19px] font-semibold ${tone}`}>{title}</h2>
        <span className="font-mono text-[12px] text-fg-dim">{count}</span>
      </div>
      {count > 0 ? <ul className="flex flex-col gap-3">{children}</ul> : <p className="text-[13px] text-fg-dim">Нет пунктов.</p>}
    </section>
  )
}

function AnalystText({ item }: { item: AnalystItem }) {
  return (
    <div className="min-w-0 break-words">
      <p className="font-mono text-[11px] text-fg-dim">{item.id}{item.story && ` · ${item.story}`}</p>
      <p className="mt-1 text-[14px] leading-relaxed text-fg">{item.text}</p>
    </div>
  )
}

function TaskText({ id, task }: { id: string; task?: Task }) {
  return (
    <div className="min-w-0 break-words">
      <p className="font-mono text-[11px] text-fg-dim">{id}{task && ` · ${task.type}`}</p>
      <p className="mt-1 text-[14px] leading-relaxed text-fg">{task?.title ?? 'Задача не найдена в запуске'}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {task?.requirement_ids.map((req) => <span key={req} className="rounded-full border border-line-strong px-2 py-0.5 font-mono text-[11px] text-fg-muted">{req}</span>)}
      </div>
    </div>
  )
}

function ErrorMessage({ message }: { message: string }) {
  return <p role="alert" className="m-0 rounded-2xl border border-hazard/60 bg-hazard-deep/40 px-4 py-3 font-mono text-[13px] text-hazard">{message}</p>
}
