import { AGENTS } from '@/entities/agent'
import { typeOut } from '@/shared/lib/typeOut'
import { DEMO_DELIVERABLES } from './scenario'
import { agentTiming, TYPING_SPEED } from './timeline'
import type { AgentRunState, AgentStatus } from './types'

export function computeAgents(time: number): AgentRunState[] {
  return AGENTS.map((agent, index) => {
    const timing = agentTiming(index)
    const deliverable = DEMO_DELIVERABLES[agent.id]
    const status: AgentStatus =
      time < timing.arrivedAt ? 'waiting' : time < timing.doneAt ? 'working' : 'done'
    const delivered = time >= timing.deliveredAt

    return {
      agent,
      timing,
      status,
      receiving: status === 'waiting' && time >= timing.dispatchedAt,
      delivered,
      deliverable,
      revealed: delivered
        ? typeOut(deliverable.text, timing.deliveredAt, time, TYPING_SPEED.result)
        : { text: '', typing: false },
    }
  })
}
