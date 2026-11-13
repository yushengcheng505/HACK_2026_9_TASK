import type { RunView } from '@/entities/run'
import { useCountUp } from '@/shared/lib/useCountUp'

interface MetricProps {
  label: string
  value: number
  suffix?: string
  tone?: 'fg' | 'brand' | 'hazard' | 'amber'
  hint?: string
  bar?: number
}

const TONE = { fg: 'text-fg', brand: 'text-brand', hazard: 'text-hazard', amber: 'text-amber' }
const BAR = { fg: 'bg-fg', brand: 'bg-brand', hazard: 'bg-hazard', amber: 'bg-amber' }

function Metric({ label, value, suffix = '', tone = 'fg', hint, bar }: MetricProps) {
  const shown = useCountUp(value)
  return (
    <div className="relative flex min-w-0 flex-col justify-between gap-1 bg-ink px-4 py-3">
      <span className="tag text-fg-dim">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <data value={value} className={`font-display text-[30px] leading-none font-semibold tracking-[-0.04em] tabular-nums ${TONE[tone]}`}>
          {Math.round(shown)}
        </data>
        {suffix && <span className={`font-display text-[15px] font-semibold ${TONE[tone]}`}>{suffix}</span>}
      </span>
      <span className="truncate font-mono text-[11px] text-fg-dim">{hint ?? '\u00a0'}</span>
      {bar !== undefined && (
        <span className="absolute inset-x-0 bottom-0 h-[2px] bg-line">
          <span
            className={`block h-full origin-left transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${BAR[tone]}`}
            style={{ transform: `scaleX(${Math.max(0, Math.min(1, bar))})` }}
          />
        </span>
      )}
    </div>
  )
}

export function RunMetrics({ view }: { view: RunView }) {
  const tasks = view.stories.reduce((n, s) => n + s.tasks.length, 0)
  const tests = view.stories.reduce((n, s) => n + s.tasks.filter((t) => t.type === 'qa' || t.test_scenarios.length).length, 0)
  const coverage = view.coverage?.coverage_percent ?? 0
  const coverageTone = !view.coverage ? 'fg' : coverage >= 90 ? 'brand' : coverage >= 60 ? 'amber' : 'hazard'
  const ops = view.contractOps.length
  const opsUsed = view.coverage?.contract_ops_used.length ?? 0
  const errors = view.issues.filter((i) => i.severity === 'error').length
  const lang = view.language

  return (
    <div className="grid grid-cols-7 gap-px border-b border-line bg-line">
      <Metric label="Требования" value={view.requirements.length} hint="REQ · атомарные" />
      <Metric label="Истории" value={view.stories.length} hint="US · как… хочу… чтобы" />
      <Metric label="Задачи" value={tasks} hint={`из них тестов: ${tests}`} />
      <Metric
        label="Пробелы"
        value={view.gaps.length}
        tone={view.gaps.length ? 'hazard' : 'fg'}
        hint={view.gaps.length ? 'противоречия и дыры' : 'не найдено'}
      />
      <Metric
        label="Покрытие"
        value={coverage}
        suffix="%"
        tone={coverageTone}
        bar={view.coverage ? coverage / 100 : undefined}
        hint={view.coverage ? `ошибок ОТК: ${errors}` : 'после проверок'}
      />
      <Metric
        label="Контракт"
        value={opsUsed}
        suffix={`/${ops}`}
        tone={ops && opsUsed ? 'brand' : 'fg'}
        bar={ops ? opsUsed / ops : undefined}
        hint="операций в работе"
      />
      <div className="flex min-w-0 flex-col justify-between gap-1 bg-ink px-4 py-3">
        <span className="tag text-fg-dim">Целевой язык</span>
        <span className="truncate font-display text-[24px] leading-none font-semibold tracking-[-0.03em] text-fg">
          {lang?.value ?? '—'}
        </span>
        <span className="truncate font-mono text-[11px] text-fg-dim" title={lang?.evidence.join(', ')}>
          {lang ? `уверенность ${Math.round(lang.confidence * 100)}%` : 'определяю…'}
        </span>
      </div>
    </div>
  )
}
