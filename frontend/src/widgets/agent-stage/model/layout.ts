import { ROSTER, type AgentId, type AgentTeam } from '@/entities/agent'
import type { Point, QuadCurve } from '@/shared/lib/math'

/** Координаты в системе viewBox сцены 1200×600. */
export const SCENE_SIZE = { width: 1200, height: 600 } as const

/** Маленькие модели роботов (рамка 48×40, голова 32×26) увеличены так, что голова на сцене — 80×65. */
export const AGENT_FIGURE_SCALE = 2.5

/** Шаг между роботами одинаковый в обоих рядах; ряд покороче стоит по центру под длинным. */
const COLUMN_STEP = 144
const FIRST_COLUMN = 538

const teamSize = (team: AgentTeam) => ROSTER.filter((agent) => agent.team === team).length
const WIDEST_ROW = Math.max(teamSize('decomposition'), teamSize('review'))

const columnsFor = (team: AgentTeam) => {
  const start = FIRST_COLUMN + ((WIDEST_ROW - teamSize(team)) * COLUMN_STEP) / 2
  return Array.from({ length: teamSize(team) }, (_, index) => start + index * COLUMN_STEP)
}

const COLUMNS: Record<AgentTeam, readonly number[]> = {
  decomposition: columnsFor('decomposition'),
  review: columnsFor('review'),
}

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
}

const columnOf = (id: AgentId) => {
  const agent = ROSTER.find((a) => a.id === id)!
  return ROSTER.filter((a) => a.team === agent.team).indexOf(agent)
}

export const AGENT_SLOTS = Object.fromEntries(
  ROSTER.map((agent) => [agent.id, { cx: COLUMNS[agent.team][columnOf(agent.id)], bodyY: TEAM_ROWS[agent.team].bodyY }]),
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
  const team = ROSTER.find((a) => a.id === id)!.team
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

export const FLIGHT_ROUTES = Object.fromEntries(ROSTER.map((agent) => [agent.id, routeFor(agent.id)])) as Record<
  AgentId,
  FlightRoute
>
