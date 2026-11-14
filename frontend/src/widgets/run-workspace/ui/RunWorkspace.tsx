import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRunStream } from '@/features/run-stream'
import { RunProgress, stagesOf } from '@/widgets/run-progress'
import type { StageId } from '@/widgets/run-progress'
import { StoryFocus, TraceMap } from '@/widgets/trace-map'
import { Inspector } from '@/widgets/inspector'
import { Telemetry } from '@/widgets/telemetry'
import { QuestionsPanel } from '@/widgets/questions-panel'
import { ResultsTable } from '@/widgets/results-table'
import { QcReport } from '@/widgets/qc-report'
import { GapsBoard } from '@/widgets/gaps-board'
import { AgentFlow, FlowHeader } from '@/widgets/agent-flow'
import type { RunMode } from '@/shared/lib/useHashRoute'

type Tab = 'map' | 'table' | 'qc' | 'gaps'
type MapView = 'lanes' | 'columns'
const MAP_VIEWS: { id: MapView; label: string }[] = [
  { id: 'lanes', label: 'По историям' },
  { id: 'columns', label: 'Колонки' },
]

interface RunWorkspaceProps {
  runId: string
  mode: RunMode
}

export function RunWorkspace({ runId, mode }: RunWorkspaceProps) {
  const { view, refresh, replay, speed, startReplay } = useRunStream(runId)
  const [tab, setTab] = useState<Tab>('map')
  const [selected, setSelected] = useState<string | null>(null)
  const [gapId, setGapId] = useState<string | null>(null)
  const [stage, setStage] = useState<StageId | null>(null)
  const [mapView, setMapView] = useState<MapView>('lanes')
  const lanes = mapView === 'lanes'

  const select = useCallback((key: string | null) => {
    setSelected(key)
    setGapId(null)
    setStage(null)
  }, [])
  const showGap = useCallback((id: string | null) => {
    setGapId(id)
    setSelected(null)
    setStage(null)
    setTab('map')
  }, [])
  const showStage = useCallback((id: StageId) => {
    setStage((s) => (s === id ? null : id))
    setSelected(null)
    setGapId(null)
  }, [])
  const stagePanel = useMemo(() => {
    const s = stage ? stagesOf(view).find((x) => x.id === stage) : null
    return s ? { kicker: 'Этап прогона', title: s.label, rows: s.rows } : null
  }, [stage, view])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelected(null)
        setGapId(null)
        setStage(null)
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

  if (mode === 'agents') {
    return (
      <div className="relative h-full">
        <AgentFlow view={view} replay={replay} speed={speed} onReplay={startReplay} />
        {view.waitingAnswers && !replay && <QuestionsPanel runId={runId} questions={view.questions} />}
      </div>
    )
  }

  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_minmax(0,1fr)_auto]">
      <FlowHeader view={view} mode="pult" replay={replay} speed={speed} onReplay={startReplay} />
      <RunProgress view={view} selected={stage} onSelect={showStage} />

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
            {tab === 'map' && (
              <div className="af-seg ml-auto self-center" role="group" aria-label="Вид карты">
                {MAP_VIEWS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setMapView(v.id)}
                    aria-pressed={mapView === v.id}
                    className={`af-seg-item ${mapView === v.id ? 'af-seg-on' : ''}`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div key={tab === 'map' ? `map-${lanes}` : tab} className="fx-fade relative min-h-0 flex-1">
            {tab === 'map' && lanes && <StoryFocus view={view} selected={selected} onSelect={select} gapId={gapId} />}
            {tab === 'map' && !lanes && <TraceMap view={view} selected={selected} onSelect={select} gapId={gapId} />}
            {tab === 'table' && <ResultsTable view={view} onSaved={refresh} onSelect={(k) => { select(k); setTab('map') }} />}
            {tab === 'qc' && <QcReport view={view} onSelect={(k) => { select(k); setTab('map') }} />}
            {tab === 'gaps' && <GapsBoard view={view} onShow={showGap} />}
          </div>

          {view.waitingAnswers && !replay && <QuestionsPanel runId={runId} questions={view.questions} />}
        </div>
        <Inspector view={view} selected={selected} onSelect={select} onGap={showGap} stage={stagePanel} />
      </div>

      <Telemetry view={view} />
    </div>
  )
}
