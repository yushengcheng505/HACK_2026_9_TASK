import { HOPS } from '@/features/team-run'
import { easeInOutQuad, poseOnQuadCurve, quadCurvePath, type Pose } from '@/shared/lib/math'
import { HOP_ROUTES } from './layout'

/** handoff — работа идёт дальше по цепочке, result — итог летит NAPS. */
export type FlightKind = 'handoff' | 'result'

/** idle — по дорожке ещё не летали, flying — самолётик в пути, visited — уже долетел. */
export type TrailState = 'idle' | 'visited' | 'flying'

export interface Trail {
  key: string
  kind: FlightKind
  path: string
  state: TrailState
}

export interface Plane {
  key: string
  kind: FlightKind
  pose: Pose
}

export function computeFlights(time: number) {
  const trails: Trail[] = []
  const planes: Plane[] = []

  for (const hop of HOPS) {
    const route = HOP_ROUTES[hop.key]
    const kind: FlightKind = hop.to === 'naps' ? 'result' : 'handoff'
    const flying = time >= hop.start && time < hop.end

    trails.push({
      key: hop.key,
      kind,
      path: quadCurvePath(route),
      state: flying ? 'flying' : time >= hop.end ? 'visited' : 'idle',
    })
    if (flying) {
      planes.push({
        key: hop.key,
        kind,
        pose: poseOnQuadCurve(route, easeInOutQuad((time - hop.start) / (hop.end - hop.start))),
      })
    }
  }

  return { trails, planes }
}
