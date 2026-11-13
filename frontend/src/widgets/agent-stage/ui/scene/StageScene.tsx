import type { RunFrame } from '@/features/team-run'
import { computeFlights } from '../../model/computeFlights'
import { SCENE_SIZE } from '../../model/layout'
import { OrchestratorConsole } from '../OrchestratorConsole'
import { AgentSlot } from './agents/AgentSlot'
import { Orchestrator } from './orchestrator/Orchestrator'
import { PaperPlanes } from './PaperPlanes'
import { RouteTrails } from './RouteTrails'
import './scene.css'

interface StageSceneProps {
  frame: RunFrame
}

export function StageScene({ frame }: StageSceneProps) {
  const { trails, planes } = computeFlights(frame.agents, frame.time)

  return (
    <div className="overflow-x-auto rounded-[20px]">
      <div className="scene-canvas @container relative aspect-[1200/600] min-w-[900px] overflow-hidden rounded-[20px] border border-line-scene">
        <svg
          viewBox={`0 0 ${SCENE_SIZE.width} ${SCENE_SIZE.height}`}
          className="absolute inset-0 block size-full"
          role="img"
          aria-label="Оркестратор Ядро отправляет бумажные самолётики с задачами четырём агентам и получает результаты обратно"
        >
          <RouteTrails trails={trails} />
          <Orchestrator state={frame.orchestrator} time={frame.time} />
          {frame.agents.map((state) => (
            <AgentSlot key={state.agent.id} state={state} />
          ))}
          <PaperPlanes planes={planes} />
        </svg>
        <OrchestratorConsole state={frame.orchestrator} />
      </div>
    </div>
  )
}
