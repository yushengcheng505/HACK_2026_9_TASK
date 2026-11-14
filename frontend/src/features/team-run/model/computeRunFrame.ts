import { computeAgents } from './computeAgents'
import { computeOrchestrator } from './computeOrchestrator'
import { PHASE_STARTS } from './timeline'
import type { RunFrame, RunPhase } from './types'

function computePhase(time: number): RunPhase {
  return PHASE_STARTS.filter((start) => time >= start).length
}

/** Чистая функция: всё состояние страницы в момент времени `time` (секунды от старта). */
export function computeRunFrame(time: number): RunFrame {
  return {
    time,
    phase: computePhase(time),
    agents: computeAgents(time),
    orchestrator: computeOrchestrator(time),
  }
}
