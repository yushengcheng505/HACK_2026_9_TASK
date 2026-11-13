export type Point = readonly [x: number, y: number]

export interface QuadCurve {
  from: Point
  control: Point
  to: Point
}

export interface Pose {
  x: number
  y: number
  angle: number
}

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

export const easeInOutQuad = (p: number) =>
  p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2

export function quadCurvePath({ from, control, to }: QuadCurve) {
  return `M ${from.join(' ')} Q ${control.join(' ')} ${to.join(' ')}`
}

export function poseOnQuadCurve({ from, control, to }: QuadCurve, s: number): Pose {
  const u = 1 - s
  const x = u * u * from[0] + 2 * u * s * control[0] + s * s * to[0]
  const y = u * u * from[1] + 2 * u * s * control[1] + s * s * to[1]
  const dx = 2 * u * (control[0] - from[0]) + 2 * s * (to[0] - control[0])
  const dy = 2 * u * (control[1] - from[1]) + 2 * s * (to[1] - control[1])
  return { x, y, angle: (Math.atan2(dy, dx) * 180) / Math.PI }
}

export const poseTransform = ({ x, y, angle }: Pose) =>
  `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle.toFixed(1)})`
