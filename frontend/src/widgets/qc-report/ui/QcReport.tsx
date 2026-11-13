import { contractOpStatus, keyForId, nodeKey, shortOp } from '@/entities/run'
import type { OpStatus, RunView, Severity } from '@/entities/run'

const STATUS: Record<OpStatus, { text: string; cls: string }> = {
  covered: { text: 'покрыт', cls: 'text-brand' },
  no_tests: { text: 'нет теста', cls: 'text-amber' },
  no_tasks: { text: 'нет задач', cls: 'text-hazard' },
  unused: { text: 'подтвердите', cls: 'text-fg-dim' },
  pending: { text: '—', cls: 'text-fg-dim' },
}
const SEVERITY: Record<Severity, { text: string; cls: string }> = {
  error: { text: 'ошибка', cls: 'text-hazard border-hazard/60' },
  warning: { text: 'внимание', cls: 'text-amber border-amber/50' },
  info: { text: 'инфо', cls: 'text-fg-dim border-line-input' },
}

export function QcReport({ view, onSelect }: { view: RunView; onSelect: (key: string) => void }) {
  if (!view.coverage) {
    return <div className="flex h-full items-center justify-center tag text-fg-dim">Проверки кодом ещё не запускались</div>
  }
  const errors = view.issues.filter((i) => i.severity === 'error').length
  const ops = view.sources.filter((s) => s.kind === 'proto_rpc' || s.kind === 'openapi_op')
  const tasks = view.stories.flatMap((s) => s.tasks)
  const sorted = [...view.issues].sort((a, b) => ['error', 'warning', 'info'].indexOf(a.severity) - ['error', 'warning', 'info'].indexOf(b.severity))

  return (
    <div className="h-full overflow-y-auto">
      <div className="grid gap-px bg-line xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section className="bg-ink px-6 py-5">
          <div className="mb-4 flex items-start justify-between gap-6">
            <div className="flex flex-col gap-2">
              <span className="tag text-fg-dim">[ покрытие контракта ]</span>
              <p className="max-w-[460px] text-[13px] leading-relaxed text-fg-muted">
                Каждая операция, которая нужна требованиям, должна получить задачу на реализацию и интеграционный тест.
                Это считает код по связям, а не модель.
              </p>
            </div>
            <div
              className={`-rotate-3 border-[3px] px-4 py-2 text-center ${errors ? 'border-hazard text-hazard' : 'border-brand text-brand'}`}
              aria-label={errors ? 'Брак' : 'Принято'}
            >
              <div className="tag text-[10px]">ОТК · проверки кодом</div>
              <div className="font-display text-[26px] leading-none font-semibold tracking-[-0.02em]">{errors ? 'БРАК' : 'ПРИНЯТО'}</div>
              <div className="tag text-[10px]">{errors ? `ошибок: ${errors}` : `покрытие ${view.coverage.coverage_percent}%`}</div>
            </div>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_110px_70px_70px] gap-px border border-line bg-line">
            {['Операция', 'Статус', 'Задач', 'Тестов'].map((h) => (
              <div key={h} className="tag bg-surface px-3 py-2 text-fg-dim">{h}</div>
            ))}
            {ops.map((op) => {
              const status = STATUS[contractOpStatus(view, op.id)]
              const using = tasks.filter((t) => t.source_refs.includes(op.id))
              const tests = using.filter((t) => t.type === 'qa' || t.test_scenarios.length)
              const short = shortOp(op)
              return (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => onSelect(nodeKey('source', op.id))}
                  className="press col-span-full grid cursor-pointer grid-cols-subgrid bg-ink text-left hover:bg-surface"
                >
                  <span className="min-w-0 px-3 py-2.5">
                    <span className="block truncate font-mono text-[12.5px] font-bold text-fg">{short.name}</span>
                    <span className="block truncate font-mono text-[10.5px] text-fg-dim">{short.scope}</span>
                  </span>
                  <span className={`tag self-center px-3 ${status.cls}`}>{status.text}</span>
                  <span className="self-center px-3 text-right font-mono text-[13px] text-fg-soft tabular-nums">{using.length}</span>
                  <span className={`self-center px-3 text-right font-mono text-[13px] tabular-nums ${tests.length ? 'text-fg-soft' : 'text-fg-dim'}`}>
                    {tests.length}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="bg-ink px-6 py-5">
          <div className="tag mb-4 flex justify-between text-fg-dim">
            <span>[ замечания проверок ]</span>
            <span>{view.issues.length}</span>
          </div>
          {sorted.length === 0 && <p className="text-[14px] text-brand">Замечаний нет: ссылки существуют, связи целы, контракт покрыт.</p>}
          <ul className="flex flex-col gap-1.5">
            {sorted.map((i, n) => (
              <li key={`${i.code}-${i.target_id}-${n}`}>
                <button
                  type="button"
                  onClick={() => onSelect(keyForId(i.target_id))}
                  className="press flex w-full cursor-pointer items-start gap-3 border border-line bg-surface px-3 py-2.5 text-left hover:border-line-input"
                >
                  <span className={`tag shrink-0 border px-1.5 py-0.5 text-[9.5px] ${SEVERITY[i.severity].cls}`}>{SEVERITY[i.severity].text}</span>
                  <span className="min-w-0">
                    <span className="block font-mono text-[11.5px] font-bold text-fg">{i.target_id}</span>
                    <span className="block text-[12.5px] leading-snug text-fg-muted">{i.message}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
