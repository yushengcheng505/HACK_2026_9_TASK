import { palette } from '@/shared/config/palette'
import type { FlightKind, Trail, TrailState } from '../../model/computeFlights'

const TRAIL_COLOR: Record<FlightKind, string> = {
  handoff: palette.mint,
  result: palette.brand,
}

const TRAIL_OPACITY: Record<FlightKind, Record<TrailState, number>> = {
  handoff: { idle: 0.12, visited: 0.3, flying: 0.8 },
  result: { idle: 0.1, visited: 0.35, flying: 0.85 },
}

interface RouteTrailsProps {
  trails: Trail[]
}

export function RouteTrails({ trails }: RouteTrailsProps) {
  return (
    <g data-layer="trails">
      {trails.map((trail) => (
        <path
          key={trail.key}
          d={trail.path}
          stroke={TRAIL_COLOR[trail.kind]}
          opacity={TRAIL_OPACITY[trail.kind][trail.state]}
          className={trail.state === 'flying' ? 'scene-trail fx-flow' : 'scene-trail'}
        />
      ))}
    </g>
  )
}
