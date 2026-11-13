import type { AgentId } from '@/entities/agent'
import type { AgentRunState } from '@/features/team-run'
import { easeInOutQuad, poseOnQuadCurve, quadCurvePath, type Pose } from '@/shared/lib/math'
import { FLIGHT_ROUTES } from './layout'

export type FlightDirection = 'out' | 'back'

/** idle — маршрут ещё не нужен или уже не актуален, visited — по нему уже летали, flying — самолётик в пути. */
export type TrailState = 'idle' | 'visited' | 'flying'

export interface Trail {
  key: string
  direction: FlightDirection
  path: string
  state: TrailState
}

export interface Plane {
  key: string
  agentId: AgentId
  direction: FlightDirection
  pose: Pose
}

const progress = (time: number, start: number, end: number) =>
  easeInOutQuad((time - start) / (end - start))

export function computeFlights(agents: AgentRunState[], time: number) {
  const trails: Trail[] = []
  const planes: Plane[] = []

  for (const { agent, timing } of agents) {
    const route = FLIGHT_ROUTES[agent.id]
    const flyingOut = time >= timing.dispatchedAt && time < timing.arrivedAt
    const flyingBack = time >= timing.doneAt && time < timing.deliveredAt

    trails.push({
      key: `${agent.id}-out`,
      direction: 'out',
      path: quadCurvePath(route.out),
      state: flyingOut
        ? 'flying'
        : time >= timing.dispatchedAt && time < timing.deliveredAt
          ? 'visited'
          : 'idle',
    })
    trails.push({
      key: `${agent.id}-back`,
      direction: 'back',
      path: quadCurvePath(route.back),
      state: flyingBack ? 'flying' : time >= timing.deliveredAt ? 'visited' : 'idle',
    })

    if (flyingOut) {
      planes.push({
        key: `${agent.id}-out`,
        agentId: agent.id,
        direction: 'out',
        pose: poseOnQuadCurve(route.out, progress(time, timing.dispatchedAt, timing.arrivedAt)),
      })
    }
    if (flyingBack) {
      planes.push({
        key: `${agent.id}-back`,
        agentId: agent.id,
        direction: 'back',
        pose: poseOnQuadCurve(route.back, progress(time, timing.doneAt, timing.deliveredAt)),
      })
    }
  }

  return { trails, planes }
}
