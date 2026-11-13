import type { ReactNode } from 'react'

interface ExpressionLayerProps {
  visible: boolean
  children: ReactNode
}

/** Все выражения лица отрисованы всегда, видимое переключается прозрачностью. */
export function ExpressionLayer({ visible, children }: ExpressionLayerProps) {
  return <g opacity={visible ? 1 : 0}>{children}</g>
}
