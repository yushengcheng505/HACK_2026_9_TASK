import { AGENTS, type AgentId, type AgentTeam } from '@/entities/agent'
import type { Point, QuadCurve } from '@/shared/lib/math'

/** Координаты в системе viewBox сцены 1200×600. */
export const SCENE_SIZE = { width: 1200, height: 600 } as const

/** Роботы нарисованы в своих координатах (корпус 120×100, центр — (0, 200)) и уменьшены до AGENT_SCALE. */
export const AGENT_SCALE = 0.68
export const BOT_BODY_CENTER_Y = 200

const COLUMNS = [560, 735, 910, 1085] as const

export interface TeamRow {
  /** Центр корпусов роботов этой команды по Y. */
  bodyY: number
}

export const TEAM_ROWS: Record<AgentTeam, TeamRow> = {
  decomposition: { bodyY: 150 },
  review: { bodyY: 412 },
}

/** Подписи под роботом — смещения от центра корпуса, в координатах сцены. */
export const CAPTION = {
  shadowY: 47,
  nameY: 68,
  focusY: 84,
  chipY: 92,
  chipHeight: 22,
  chipWidth: 88,
} as const

export interface AgentSlot {
  cx: number
  bodyY: number
  /** Сдвиг фазы покачивания, чтобы агенты двигались не синхронно. */
  motionDelay: string
  blinkDelay: string
}

const columnOf = (id: AgentId) => {
  const agent = AGENTS.find((a) => a.id === id)!
  return AGENTS.filter((a) => a.team === agent.team).indexOf(agent)
}

export const AGENT_SLOTS = Object.fromEntries(
  AGENTS.map((agent, index) => {
    const column = columnOf(agent.id)
    return [
      agent.id,
      {
        cx: COLUMNS[column],
        bodyY: TEAM_ROWS[agent.team].bodyY,
        motionDelay: `${-((index * 0.73) % 4).toFixed(2)}s`,
        blinkDelay: `${-((index * 1.37) % 5.2).toFixed(2)}s`,
      },
    ]
  }),
) as Record<AgentId, AgentSlot>

export interface FlightRoute {
  out: QuadCurve
  back: QuadCurve
}

/** Габарит робота с подписью относительно центра корпуса: всё, через что самолётик лететь не должен. */
export const AGENT_BOUNDS = { halfWidth: 78, top: 72, bottom: CAPTION.chipY + CAPTION.chipHeight } as const

/** Подписи рядов стоят вертикально слева от роботов, чтобы коридор между рядами был свободен. */
export const TEAM_LABEL_X = 466

/** Где самолётики касаются NAPS: вылет к верхнему ряду, приём от него (справа от клавиатуры), вылет к нижнему, приём в консоль. */
const NAPS_PORTS = {
  toTop: [292, 150],
  fromTop: [308, 270],
  toBottom: [318, 300],
  fromBottom: [362, 540],
} as const

/**
 * У каждого самолётика своя дорожка, и ни одна не проходит через роботов:
 * верхний ряд получает задачи по дугам над собой и отдаёт ответы по верхней полосе коридора между рядами;
 * нижний получает по нижней полосе коридора (сверху, над головами соседей) и отдаёт под собой — в консоль NAPS.
 */
function routeFor(id: AgentId): FlightRoute {
  const { cx, bodyY } = AGENT_SLOTS[id]
  const column = columnOf(id)
  const team = AGENTS.find((a) => a.id === id)!.team
  const top: Point = [cx, bodyY - AGENT_BOUNDS.top - 4]
  const bottom: Point = [cx, bodyY + AGENT_BOUNDS.bottom + 6]

  if (team === 'decomposition') {
    return {
      out: { from: NAPS_PORTS.toTop, control: [(292 + cx) / 2, 30 - column * 26], to: top },
      back: { from: bottom, control: [(cx + 300) / 2, 290 + column * 4], to: NAPS_PORTS.fromTop },
    }
  }
  return {
    out: { from: NAPS_PORTS.toBottom, control: [cx - 90 - column * 10, 326 + column * 2], to: top },
    back: { from: bottom, control: [(cx + 360) / 2, 594 + column * 4], to: NAPS_PORTS.fromBottom },
  }
}

export const FLIGHT_ROUTES = Object.fromEntries(AGENTS.map((agent) => [agent.id, routeFor(agent.id)])) as Record<
  AgentId,
  FlightRoute
>
