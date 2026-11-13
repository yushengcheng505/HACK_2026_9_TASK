import { useCallback, useEffect, useState } from 'react'
import { useRunStream } from '@/features/run-stream'
import { RunHeader } from '@/widgets/run-header'
import { RunMetrics } from '@/widgets/run-metrics'
import { PipelineRail } from '@/widgets/pipeline-rail'
import { TraceMap } from '@/widgets/trace-map'
import { Inspector } from '@/widgets/inspector'
import { Telemetry } from '@/widgets/telemetry'
import { QuestionsPanel } from '@/widgets/questions-panel'
import { ResultsTable } from '@/widgets/results-table'
import { QcReport } from '@/widgets/qc-report'
import { GapsBoard } from '@/widgets/gaps-board'

type Tab = 'map' | 'table' | 'qc' | 'gaps'

interface RunWorkspaceProps {
  runId: string
}

export function RunWorkspace({ runId }: RunWorkspaceProps) {
  const { view, refresh, replay, startReplay } = useRunStream(runId)
  const [tab, setTab] = useState<Tab>('map')
  const [selected, setSelected] = useState<string | null>(null)
  const [gapId, setGapId] = useState<string | null>(null)

  const select = useCallback((key: string | null) => {
    setSelected(key)
    setGapId(null)
  }, [])
  const showGap = useCallback((id: string | null) => {
    setGapId(id)
    setSelected(null)
    setTab('map')
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelected(null)
        setGapId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const errors = view.issues.filter((i) => i.severity === 'error').length
  const tabs: { id: Tab; label: string; badge?: string; tone?: string }[] = [
    { id: 'map', label: 'Трассировочная карта' },
    { id: 'table', label: 'Таблица', badge: String(view.stories.reduce((n, s) => n + s.tasks.length, 0)) },
    { id: 'qc', label: 'ОТК', badge: view.coverage ? String(view.issues.length) : undefined, tone: errors ? 'text-hazard' : 'text-fg-dim' },
    { id: 'gaps', label: 'Пробелы', badge: String(view.gaps.length), tone: view.gaps.length ? 'text-hazard' : 'text-fg-dim' },
  ]

  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_auto_minmax(0,1fr)_auto]">
      <RunHeader view={view} replay={replay} onReplay={startReplay} />
      <RunMetrics view={view} />
      <PipelineRail view={view} />

      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
        <div className="relative flex min-h-0 min-w-0 flex-col">
          <div role="tablist" className="flex shrink-0 items-stretch gap-px border-b border-line bg-ink/90 px-4">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`press relative flex cursor-pointer items-center gap-2 px-3.5 py-2.5 text-[13px] font-semibold ${
                  tab === t.id ? 'text-fg' : 'text-fg-dim hover:text-fg-soft'
                }`}
              >
                {t.label}
                {t.badge !== undefined && <span className={`font-mono text-[11px] ${t.tone ?? 'text-fg-dim'}`}>{t.badge}</span>}
                <span
                  className={`absolute inset-x-2 -bottom-px h-[2px] bg-brand transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                    tab === t.id ? 'scale-x-100' : 'scale-x-0'
                  }`}
                />
              </button>
            ))}
            {view.status === 'failed' && (
              <span className="tag ml-auto self-center truncate text-hazard" title={view.error ?? ''}>
                сбой: {view.error}
              </span>
            )}
          </div>

          <div className="relative min-h-0 flex-1">
            {tab === 'map' && <TraceMap view={view} selected={selected} onSelect={select} gapId={gapId} />}
            {tab === 'table' && <ResultsTable view={view} onSaved={refresh} onSelect={(k) => { select(k); setTab('map') }} />}
            {tab === 'qc' && <QcReport view={view} onSelect={(k) => { select(k); setTab('map') }} />}
            {tab === 'gaps' && <GapsBoard view={view} onShow={showGap} />}
          </div>

          {view.waitingAnswers && !replay && <QuestionsPanel runId={runId} questions={view.questions} />}
        </div>
        <Inspector view={view} selected={selected} onSelect={select} onGap={showGap} />
      </div>

      <Telemetry view={view} />
    </div>
  )
}
