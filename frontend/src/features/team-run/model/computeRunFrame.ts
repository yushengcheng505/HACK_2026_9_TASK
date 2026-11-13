import { typeOut, type TypedText } from '@/shared/lib/typeOut'
import { computeAgents } from './computeAgents'
import { computeOrchestrator } from './computeOrchestrator'
import { DEMO_SUMMARY, SUMMARY_PLACEHOLDERS } from './scenario'
import { PHASE_STARTS, RUN_TIMELINE, TYPING_SPEED } from './timeline'
import type { AgentRunState, ResultStatus, RunFrame, RunPhase } from './types'

function computePhase(time: number): RunPhase {
  return PHASE_STARTS.filter((start) => time >= start).length
}

function computeResultStatus(time: number, agents: AgentRunState[]): ResultStatus {
  const delivered = agents.filter((agent) => agent.delivered).length
  if (delivered < agents.length) return { kind: 'collecting', delivered, total: agents.length }
  return time < RUN_TIMELINE.complete ? { kind: 'assembling' } : { kind: 'ready' }
}

function computeSummary(time: number): TypedText {
  if (time >= RUN_TIMELINE.complete) {
    return typeOut(DEMO_SUMMARY, RUN_TIMELINE.complete, time, TYPING_SPEED.summary)
  }
  if (time >= RUN_TIMELINE.assemblyStart) {
    return { text: SUMMARY_PLACEHOLDERS.assembling, typing: true }
  }
  return { text: SUMMARY_PLACEHOLDERS.waiting, typing: false }
}

/** Чистая функция: всё состояние страницы в момент времени `time` (секунды от старта). */
export function computeRunFrame(time: number): RunFrame {
  const agents = computeAgents(time)
  return {
    time,
    phase: computePhase(time),
    agents,
    orchestrator: computeOrchestrator(time),
    resultStatus: computeResultStatus(time, agents),
    summary: computeSummary(time),
  }
}
