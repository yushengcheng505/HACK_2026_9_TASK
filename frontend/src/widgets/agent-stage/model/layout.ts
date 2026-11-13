import type { AgentId } from '@/entities/agent'
import type { QuadCurve } from '@/shared/lib/math'

/** Координаты в системе viewBox сцены 1200×600. */
export const SCENE_SIZE = { width: 1200, height: 600 } as const

export interface AgentSlot {
  /** Центр агента по X; рисунок агента задан относительно этой точки. */
  cx: number
  /** Сдвиг фазы покачивания, чтобы агенты двигались не синхронно. */
  motionDelay: string
  blinkDelay: string
}

export const AGENT_SLOTS: Record<AgentId, AgentSlot> = {
  scout: { cx: 560, motionDelay: '-0.6s', blinkDelay: '-1.1s' },
  lens: { cx: 735, motionDelay: '-1.7s', blinkDelay: '-2.4s' },
  coder: { cx: 910, motionDelay: '-2.3s', blinkDelay: '-3.3s' },
  editor: { cx: 1085, motionDelay: '-3.1s', blinkDelay: '-4s' },
}

export interface FlightRoute {
  out: QuadCurve
  back: QuadCurve
}

/** Вложенные непересекающиеся маршруты: у каждого самолётика своя дорожка. */
export const FLIGHT_ROUTES: Record<AgentId, FlightRoute> = {
  scout: {
    out: { from: [292, 174], control: [430, 70], to: [560, 136] },
    back: { from: [560, 358], control: [455, 340], to: [292, 194] },
  },
  lens: {
    out: { from: [290, 146], control: [505, 26], to: [735, 136] },
    back: { from: [735, 358], control: [560, 490], to: [296, 226] },
  },
  coder: {
    out: { from: [278, 126], control: [590, -16], to: [910, 136] },
    back: { from: [910, 358], control: [660, 565], to: [318, 264] },
  },
  editor: {
    out: { from: [250, 118], control: [670, -56], to: [1085, 134] },
    back: { from: [1085, 358], control: [770, 650], to: [326, 298] },
  },
}
