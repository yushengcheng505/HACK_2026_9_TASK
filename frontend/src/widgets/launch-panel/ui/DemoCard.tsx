import { useState } from 'react'
import type { DemoEpic } from '@/features/launch-run'
import { ROLE_LABELS, fileKind } from '@/features/launch-run'
import { Toggle } from '@/shared/ui/Toggle'

interface DemoCardProps {
  demo: DemoEpic
  busy: boolean
  onLaunch: (skipQuestions: boolean) => void
}

export function DemoCard({ demo, busy, onLaunch }: DemoCardProps) {
  const [skip, setSkip] = useState(false)
  const bullets = demo.epic_text
    .split('\n')
    .filter((l) => l.trim().startsWith('- '))
    .slice(0, 4)

  return (
    <article className="ticks fx-enter border border-line bg-surface">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="tag text-brand-mid">EPIC / {demo.id}</span>
            <h3 className="font-display text-[20px] leading-tight font-semibold tracking-[-0.02em] text-fg">{demo.title}</h3>
          </div>
          <span className="tag shrink-0 border border-line-strong px-2 py-1 text-fg-dim">интеграция</span>
        </div>
        <p className="text-[14px] leading-relaxed text-fg-muted">{demo.summary}</p>
        <ul className="flex flex-col gap-1.5 border-l border-line-strong pl-4">
          {bullets.map((b) => (
            <li key={b} className="text-[13px] leading-snug text-fg-soft">
              {b.replace(/^\s*-\s*/, '')}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-px border-t border-line bg-line sm:grid-cols-2">
        {(Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[]).map((role) => {
          const files = demo.files.filter((f) => f.role === role)
          return (
            <div key={role} className="bg-surface px-5 py-3">
              <div className="tag mb-2 text-fg-dim">{ROLE_LABELS[role].label}</div>
              <div className="flex flex-wrap gap-1.5">
                {files.length === 0 && <span className="font-mono text-[12px] text-fg-dim">—</span>}
                {files.map((f) => (
                  <span key={f.name} className="inline-flex items-center gap-1.5 border border-line-strong bg-ink px-2 py-1">
                    <span className="font-mono text-[10px] font-bold tracking-wider text-brand">{fileKind(f.name)}</span>
                    <span className="font-mono text-[12px] text-fg-soft">{f.name}</span>
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line px-5 py-4">
        <Toggle checked={skip} onChange={setSkip} label="Без вопросов — по допущениям, как вебхук" />
        <button
          type="button"
          disabled={busy}
          onClick={() => onLaunch(skip)}
          className="press inline-flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[2px] bg-brand px-5 font-display text-[14px] font-semibold text-ink hover:bg-brand-hover disabled:cursor-wait disabled:opacity-60"
        >
          {busy ? 'Запускаю…' : 'Запустить агента'}
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </article>
  )
}
