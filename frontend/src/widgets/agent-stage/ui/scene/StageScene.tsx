import type { RunFrame } from '@/features/team-run'
import { computeFlights } from '../../model/computeFlights'
import { SCENE_SIZE } from '../../model/layout'
import { OrchestratorConsole } from '../OrchestratorConsole'
import { AgentSlot } from './agents/AgentSlot'
import { Orchestrator } from './orchestrator/Orchestrator'
import { PaperPlanes } from './PaperPlanes'
import { RouteTrails } from './RouteTrails'
import { TeamLabels } from './TeamLabels'
import './scene.css'

interface StageSceneProps {
  frame: RunFrame
}

export function StageScene({ frame }: StageSceneProps) {
  const { trails, planes } = computeFlights(frame.time)

  return (
    <div className="overflow-x-auto rounded-[20px]">
      <div className="scene-canvas @container relative aspect-[1200/600] min-w-[900px] overflow-hidden rounded-[20px] border border-line-scene">
        <svg
          viewBox={`0 0 ${SCENE_SIZE.width} ${SCENE_SIZE.height}`}
          className="absolute inset-0 block size-full"
          role="img"
          aria-label="NAPS передаёт эпик Составителю, пять агентов декомпозиции по цепочке передают работу друг другу, Генератор задач отдаёт её трём проверяющим, их находки сходятся у Скептика, а итог от Скептика возвращается к NAPS"
        >
          <TeamLabels />
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
