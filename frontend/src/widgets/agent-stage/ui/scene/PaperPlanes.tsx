import { palette } from '@/shared/config/palette'
import { poseTransform } from '@/shared/lib/math'
import type { FlightDirection, Plane } from '../../model/computeFlights'

/** Белый самолётик несёт задачу, зелёный — готовый ответ. */
const PLANE_COLOR: Record<FlightDirection, string> = {
  out: palette.fg,
  back: palette.brand,
}

interface PaperPlanesProps {
  planes: Plane[]
}

export function PaperPlanes({ planes }: PaperPlanesProps) {
  return (
    <g data-layer="planes">
      {planes.map((plane) => (
        <g key={plane.key} transform={poseTransform(plane.pose)}>
          <path d="M-13 -10 L15 0 L-13 10 L-7 0 Z" fill={PLANE_COLOR[plane.direction]} />
          <path d="M-7 0 L15 0" stroke={palette.ink} opacity="0.35" className="pen-15" />
        </g>
      ))}
    </g>
  )
}
