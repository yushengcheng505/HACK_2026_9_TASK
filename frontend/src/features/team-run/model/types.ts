import type { Agent } from '@/entities/agent'
import type { AgentTiming } from './timeline'

/** waiting — ещё не получил задачу, working — работает, done — закончил и отправил ответ. */
export type AgentStatus = 'waiting' | 'working' | 'done'

export interface AgentRunState {
  agent: Agent
  timing: AgentTiming
  status: AgentStatus
  /** Самолётик с задачей уже летит к агенту. */
  receiving: boolean
}

export type OrchestratorMood = 'idle' | 'typing' | 'done'

export interface LogLine {
  key: number
  text: string
  current: boolean
}

export interface OrchestratorState {
  mood: OrchestratorMood
  statusWord: string
  typing: boolean
  progress: number
  log: LogLine[]
}

/** Индекс текущего этапа в PHASE_LABELS; PHASE_LABELS.length — всё завершено. */
export type RunPhase = number

export interface RunFrame {
  time: number
  phase: RunPhase
  agents: AgentRunState[]
  orchestrator: OrchestratorState
}
