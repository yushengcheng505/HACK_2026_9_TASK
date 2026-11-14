import type { ReactNode } from 'react'
import { REQ_TYPE, TASK_TYPE } from '@/entities/run'
import type { Finding, Requirement, Story, Task } from '@/entities/run'

export function Section({ title, count, children }: { title: string; count?: number | string; children: ReactNode }) {
  return (
    <section className="af-section">
      <h3 className="af-section-title">
        {title}
        {count !== undefined && <span className="af-section-count">{count}</span>}
      </h3>
      {children}
    </section>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="af-empty">{children}</p>
}

export function Line({ id, tag, children, dim }: { id: string; tag?: string; children: ReactNode; dim?: boolean }) {
  return (
    <li className={`af-line ${dim ? 'af-line-dim' : ''}`}>
      <span className="af-line-id">{id}</span>
      <span className="af-line-text">{children}</span>
      {tag && <span className="af-line-tag">{tag}</span>}
    </li>
  )
}

export function Requirements({ items }: { items: Requirement[] }) {
  if (!items.length) return <Empty>Требований пока нет.</Empty>
  return (
    <ul className="af-list">
      {items.map((r) => (
        <Line key={r.id} id={r.id} tag={REQ_TYPE[r.type] ?? r.type}>
          {r.text}
        </Line>
      ))}
    </ul>
  )
}

export function Stories({ items }: { items: Story[] }) {
  if (!items.length) return <Empty>Историй пока нет.</Empty>
  return (
    <ul className="af-list">
      {items.map((s) => (
        <Line key={s.id} id={s.id} tag={`${s.acceptance_criteria.length} крит.`}>
          {s.title}
        </Line>
      ))}
    </ul>
  )
}

export function Tasks({ items, dim }: { items: Task[]; dim?: boolean }) {
  return (
    <ul className="af-list">
      {items.map((t) => (
        <Line key={t.id} id={t.id} tag={TASK_TYPE[t.type]?.label ?? t.type} dim={dim}>
          {t.title}
          <span className="af-line-sub">
            DoD {t.definition_of_done.length} · тестов {t.test_scenarios.length} · {t.requirement_ids.join(', ') || 'без требований'}
          </span>
        </Line>
      ))}
    </ul>
  )
}

const VERDICT: Record<Finding['verdict'], { text: string; cls: string }> = {
  pending: { text: 'ждёт скептика', cls: 'af-v-pending' },
  confirmed: { text: 'подтверждено', cls: 'af-v-confirmed' },
  downgraded: { text: 'понижено', cls: 'af-v-downgraded' },
  rejected: { text: 'отклонено', cls: 'af-v-rejected' },
  rejected_by_filter: { text: 'отсеяно кодом', cls: 'af-v-rejected' },
  deferred: { text: 'отложено', cls: 'af-v-pending' },
}

const RESOLUTION: Record<NonNullable<Finding['resolution']>, string> = {
  fixed: 'исправлено',
  disputed: 'оспорено генератором',
  resolved: 'решено',
  not_resolved: 'не решено',
}

const SEVERITY: Record<Finding['severity'], string> = { critical: 'крит.', high: 'высок.', medium: 'сред.', low: 'низк.' }

export function Findings({ items, showSource }: { items: Finding[]; showSource?: boolean }) {
  if (!items.length) return <Empty>Находок нет.</Empty>
  return (
    <ul className="af-list">
      {items.map((f) => {
        const v = VERDICT[f.verdict]
        return (
          <li key={f.id} className={`af-finding ${f.verdict === 'rejected' || f.verdict === 'rejected_by_filter' ? 'af-line-dim' : ''}`}>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="af-line-id">{f.id}</span>
              <span className={`af-sev af-sev-${f.severity}`}>{SEVERITY[f.severity]}</span>
              <span className="af-line-tag">{f.kind}</span>
              {showSource && <span className="af-line-tag">{f.source}</span>}
              {f.task_ids.length > 0 && <span className="af-line-tag">{f.task_ids.join(', ')}</span>}
              <span className={`af-verdict ${v.cls}`}>{v.text}</span>
            </div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-soft">{f.scenario}</p>
            {f.fix && <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">Исправить: {f.fix}</p>}
            {f.verdict_reason && <p className="mt-1 text-[12px] leading-relaxed text-fg-dim italic">Скептик: {f.verdict_reason}</p>}
            {f.resolution && (
              <p className="mt-1 font-mono text-[11px] text-mint">
                {RESOLUTION[f.resolution]}
                {f.resolution_note ? ` — ${f.resolution_note}` : ''}
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function Note({ title, children, tone = 'amber' }: { title: string; children: ReactNode; tone?: 'amber' | 'brand' }) {
  return (
    <div className={`af-note af-note-${tone}`}>
      <div className="af-note-title">{title}</div>
      <div className="af-note-body">{children}</div>
    </div>
  )
}
