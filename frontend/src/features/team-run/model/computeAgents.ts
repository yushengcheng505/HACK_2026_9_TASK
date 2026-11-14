import { ROSTER } from '@/entities/agent'
import { AGENT_TIMING } from './timeline'
import type { AgentRunState, AgentStatus } from './types'

export function computeAgents(time: number): AgentRunState[] {
  return ROSTER.map((agent) => {
    const timing = AGENT_TIMING[agent.id]
    const status: AgentStatus =
      time < timing.arrivedAt ? 'waiting' : time < timing.doneAt ? 'working' : 'done'

    return {
      agent,
      timing,
      status,
      receiving: status === 'waiting' && time >= timing.dispatchedAt,
    }
  })
}
