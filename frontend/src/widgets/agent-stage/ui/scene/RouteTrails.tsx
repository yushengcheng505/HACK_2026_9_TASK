import { palette } from '@/shared/config/palette'
import type { FlightDirection, Trail, TrailState } from '../../model/computeFlights'

const TRAIL_COLOR: Record<FlightDirection, string> = {
  out: palette.mint,
  back: palette.brand,
}

const TRAIL_OPACITY: Record<FlightDirection, Record<TrailState, number>> = {
  out: { idle: 0.12, visited: 0.3, flying: 0.8 },
  back: { idle: 0.1, visited: 0.3, flying: 0.85 },
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
          stroke={TRAIL_COLOR[trail.direction]}
          opacity={TRAIL_OPACITY[trail.direction][trail.state]}
          className={trail.state === 'flying' ? 'scene-trail fx-flow' : 'scene-trail'}
        />
      ))}
    </g>
  )
}
