import type { RunView } from '@/entities/run'
import { STATUS_LABEL } from '@/entities/run'
import { REPLAY_SPEED, exportUrl } from '@/shared/api'
import { useElapsed } from '@/shared/lib/useElapsed'
import { routeHref } from '@/shared/lib/useHashRoute'

interface RunHeaderProps {
  view: RunView
  replay: boolean
  onReplay: () => void
}

export function RunHeader({ view, replay, onReplay }: RunHeaderProps) {
  const elapsed = useElapsed(view.startedAt, view.finishedAt)
  const status = STATUS_LABEL[view.status]
  const ready = view.status === 'done'
  const label = view.result?.epic.label ?? (view.title ? `${view.title.split(/\s+/).join('_')}_Autogenerate` : '')

  return (
    <header className="flex items-center gap-6 border-b border-line bg-ink/85 px-6 py-3.5 backdrop-blur-[2px]">
      <a href={routeHref({ name: 'runs' })} className="press tag shrink-0 text-fg-dim hover:text-brand" title="К журналу">
        ← журнал
      </a>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="tag flex items-center gap-3 text-fg-dim">
          <span>RUN / {view.runId}</span>
          {replay && <span className="text-amber">[ проигрывание записи · {REPLAY_SPEED}× ]</span>}
        </span>
        <h1 className="truncate font-display text-[19px] leading-tight font-semibold tracking-[-0.02em] text-fg">
          {view.title || 'Подключение к потоку…'}
        </h1>
      </div>
      {label && (
        <span className="hidden max-w-[300px] min-w-0 shrink truncate border border-line-strong bg-surface px-2 py-1 font-mono text-[11px] text-fg-soft 2xl:inline" title={label}>
          {label}
        </span>
      )}

      <div className="flex shrink-0 items-center gap-5">
        <div className={`flex items-center gap-2 ${status.cls}`}>
          <span className={`size-2 rounded-full ${status.dot}`} />
          <span className="tag">{status.text}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="tag text-fg-dim">Время</span>
          <output className="font-mono text-[15px] text-fg tabular-nums">{elapsed}</output>
        </div>
        <div className="flex gap-px border border-line bg-line">
          {(['docx', 'xlsx', 'json'] as const).map((fmt) => (
            <a
              key={fmt}
              href={ready ? exportUrl(view.runId, fmt) : undefined}
              aria-disabled={!ready}
              className={`press tag px-3 py-2 ${
                ready ? 'cursor-pointer bg-surface text-fg hover:bg-brand hover:text-ink' : 'cursor-not-allowed bg-ink text-fg-dim/50'
              }`}
            >
              {fmt}
            </a>
          ))}
        </div>
        <button
          type="button"
          onClick={onReplay}
          disabled={view.status === 'running' && !replay}
          title={`Проиграть записанный прогон, ускорение ${REPLAY_SPEED}×`}
          className="press tag cursor-pointer border border-line-input px-3 py-2 text-fg-soft hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
        >
          ▶ запись
        </button>
      </div>
    </header>
  )
}
