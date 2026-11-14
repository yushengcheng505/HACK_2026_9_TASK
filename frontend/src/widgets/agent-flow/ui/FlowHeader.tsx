import { useState } from 'react'
import { STATUS_LABEL } from '@/entities/run'
import type { RunView } from '@/entities/run'
import { pauseRun, resumeRun } from '@/features/run-control'
import { exportUrl } from '@/shared/api'
import { useElapsed } from '@/shared/lib/useElapsed'
import { routeHref } from '@/shared/lib/useHashRoute'
import { BrandName } from '@/shared/ui/BrandName'
import { LogoMark } from '@/shared/ui/LogoMark'
import type { RunMode } from '@/shared/lib/useHashRoute'
import { ConcurrencyControl } from './ConcurrencyControl'
import '../flow.css'

const SPEEDS = [4, 10, 25] as const
const MODES: { mode: RunMode; label: string }[] = [
  { mode: 'agents', label: 'Агенты' },
  { mode: 'pult', label: 'Пульт' },
]

interface FlowHeaderProps {
  view: RunView
  /** Какой вид прогона сейчас открыт: граф агентов или пульт. */
  mode: RunMode
  replay: boolean
  speed: number
  onReplay: (speed: number) => void
}

/** Шапка прогона, общая для графа агентов и пульта. */
export function FlowHeader({ view, mode, replay, speed, onReplay }: FlowHeaderProps) {
  const elapsed = useElapsed(view.startedAt, view.finishedAt)
  const status = STATUS_LABEL[view.status]
  const ready = view.status === 'done'
  const canReplay = (view.status !== 'running' && view.status !== 'paused') || replay
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const control = view.status === 'running' ? 'pause' : view.status === 'paused' ? 'resume' : null

  const toggle = async () => {
    setBusy(true)
    setError(null)
    try {
      await (control === 'pause' ? pauseRun : resumeRun)(view.runId)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <header className="af-header flex items-center gap-6 px-5">
      <a href={routeHref({ name: 'runs' })} className="press flex shrink-0 items-center gap-2.5" title="К журналу запусков">
        <LogoMark mood={ready ? 'happy' : 'calm'} />
        <BrandName className="text-[15px]" />
      </a>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-mono text-[10.5px] tracking-[0.14em] text-fg-dim uppercase">
          прогон {view.runId}
          {replay && <span className="text-amber"> · запись {speed}×</span>}
        </span>
        <h1 className="truncate text-[16px] font-semibold text-fg" title={view.title}>
          {view.title || 'Подключение к прогону…'}
        </h1>
      </div>

      <nav className="af-seg" aria-label="Вид прогона">
        {MODES.map((m) =>
          m.mode === mode ? (
            <span key={m.mode} className="af-seg-item af-seg-on" aria-current="page">
              {m.label}
            </span>
          ) : (
            <a key={m.mode} className="af-seg-item" href={routeHref({ name: 'run', id: view.runId, mode: m.mode })}>
              {m.label}
            </a>
          ),
        )}
      </nav>

      <div className={`flex shrink-0 items-center gap-2 ${status.cls}`}>
        <span className={`size-2 rounded-full ${status.dot}`} />
        <span className="font-mono text-[11px] tracking-[0.1em] uppercase">{status.text}</span>
        <output className="ml-1 font-mono text-[14px] text-fg tabular-nums">{elapsed}</output>
      </div>

      {view.status !== 'done' && view.status !== 'failed' && view.concurrency !== null && !replay && (
        <ConcurrencyControl runId={view.runId} value={view.concurrency} />
      )}

      {control && !replay && (
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={busy}
          title={error ?? (control === 'pause' ? 'Остановить прогон; продолжится с последнего сохранённого шага' : 'Продолжить прогон')}
          className={`af-seg af-seg-item af-control ${control === 'resume' ? 'af-control-resume' : ''} ${error ? 'af-control-error' : ''}`}
        >
          {control === 'pause' ? '❚❚ Пауза' : '▶ Продолжить'}
        </button>
      )}

      <div className="af-seg" role="group" aria-label="Воспроизвести запись прогона">
        <span className="af-seg-cap">▶ запись</span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={!canReplay}
            onClick={() => onReplay(s)}
            title={`Воспроизвести записанный прогон, ускорение ${s}×`}
            className={`af-seg-item ${replay && speed === s ? 'af-seg-on' : ''}`}
          >
            {s}×
          </button>
        ))}
      </div>

      <div className="af-seg" aria-label="Выгрузка">
        {(['docx', 'xlsx', 'json'] as const).map((fmt) => (
          <a
            key={fmt}
            href={ready ? exportUrl(view.runId, fmt) : undefined}
            aria-disabled={!ready}
            className={`af-seg-item uppercase ${ready ? '' : 'af-seg-disabled'}`}
          >
            {fmt}
          </a>
        ))}
      </div>
    </header>
  )
}
