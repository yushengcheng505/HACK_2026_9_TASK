import { ROSTER } from '@/entities/agent'
import { agentTiming } from './timeline'
import type { AgentRunState, AgentStatus } from './types'

export function computeAgents(time: number): AgentRunState[] {
  return ROSTER.map((agent, index) => {
    const timing = agentTiming(index)
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
