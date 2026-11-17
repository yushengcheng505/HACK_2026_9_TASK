import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RunView } from '@/entities/run'
import { buildInstances } from '../model/agents'
import type { ParticleApi } from '../model/particles'
import { useParticles } from '../model/particles'
import { useNow } from '../model/useNow'
import { FlowCanvas } from './FlowCanvas'
import { FlowHeader } from './FlowHeader'
import { Inspector } from './Inspector'
import { PrepStrip } from './PrepStrip'
import '../flow.css'

interface AgentFlowProps {
  view: RunView
  replay: boolean
  speed: number
  onReplay: (speed: number) => void
}

/** Граф агентов прогона: подготовка кодом → декомпозиция → ОТК → проверка → скептик, справа — инспектор агента. */
export function AgentFlow({ view, replay, speed, onReplay }: AgentFlowProps) {
  const [selected, setSelected] = useState<string | null>(null)
  /** На узком экране инспектор — нижняя шторка: выбор агента раскрывает её. */
  const [sheet, setSheet] = useState(false)
  const select = useCallback((key: string | null) => {
    setSelected(key)
    if (key) setSheet(true)
  }, [])
  const [armed, setArmed] = useState(false)
  const particles = useRef<ParticleApi>(null)
  const running = view.status === 'running' || view.status === 'waiting_answers'
  const now = useNow(running)
  const instances = useMemo(() => buildInstances(view, now), [view, now])

  // Первые полторы секунды поток догружает историю прогона — без меток на рёбрах.
  useEffect(() => {
    const timer = window.setTimeout(() => setArmed(true), 1500)
    return () => window.clearTimeout(timer)
  }, [])
  const live = armed || replay
  useParticles(view, particles, live)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="af-root grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
      <div className="lg:col-span-2">
        <FlowHeader view={view} mode="agents" replay={replay} speed={speed} onReplay={onReplay} />
      </div>
      <PrepStrip view={view} selected={selected === 'prep'} onSelect={() => select('prep')} />
      <FlowCanvas view={view} instances={instances} selected={selected} onSelect={select} particles={particles} live={live} />
      <div className={`af-side ${sheet ? 'af-side-open' : ''} flex min-h-0 min-w-0 flex-col lg:col-start-2 lg:row-span-2 lg:row-start-2`}>
        <button type="button" className="af-sheet-handle" onClick={() => setSheet(!sheet)} aria-expanded={sheet}>
          <i aria-hidden="true" />
          <span>{selected ? 'Агент' : 'Кто сейчас работает'}</span>
          <span>{sheet ? 'свернуть ↓' : 'открыть ↑'}</span>
        </button>
        <Inspector view={view} instances={instances} selected={selected} onSelect={select} now={now} />
      </div>
    </div>
  )
}
