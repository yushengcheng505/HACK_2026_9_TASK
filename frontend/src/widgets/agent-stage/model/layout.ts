import { ROSTER, type AgentId, type AgentTeam } from '@/entities/agent'
import { HOPS, type Hop } from '@/features/team-run'
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

/** Габарит робота с подписью относительно центра корпуса: всё, через что самолётик лететь не должен. */
export const AGENT_BOUNDS = { halfWidth: 78, top: 72, bottom: CAPTION.chipY + CAPTION.chipHeight } as const

/** Подписи рядов стоят вертикально слева от роботов, чтобы коридор между рядами был свободен. */
export const TEAM_LABEL_X = 466

/** Где самолётики касаются NAPS: эпик вылетает к верхнему ряду, итог садится в консоль NAPS. */
const NAPS_PORTS = {
  epic: [292, 150],
  result: [362, 540],
} as const

const topOf = (id: AgentId): Point => [AGENT_SLOTS[id].cx, AGENT_SLOTS[id].bodyY - AGENT_BOUNDS.top - 4]
const bottomOf = (id: AgentId): Point => [AGENT_SLOTS[id].cx, AGENT_SLOTS[id].bodyY + AGENT_BOUNDS.bottom + 6]
const teamOf = (id: AgentId) => ROSTER.find((a) => a.id === id)!.team

/**
 * Дорожки повторяют связи графа в консоли и не проходят через роботов:
 * эпик летит от NAPS дугой над верхним рядом, декомпозиция передаёт работу соседу по дуге над головами,
 * Генератор задач отдаёт её проверяющим через коридор между рядами, находки идут к Скептику под нижним рядом,
 * а итог от Скептика — ещё ниже, в консоль NAPS.
 */
function routeFor({ from, to }: Hop): QuadCurve {
  if (from === 'naps') {
    const end = topOf(to as AgentId)
    return { from: NAPS_PORTS.epic, control: [(NAPS_PORTS.epic[0] + end[0]) / 2, 30], to: end }
  }
  if (to === 'naps') {
    const start = bottomOf(from)
    return { from: start, control: [(start[0] + NAPS_PORTS.result[0]) / 2, 640], to: NAPS_PORTS.result }
  }
  if (teamOf(from) !== teamOf(to)) {
    const start = bottomOf(from)
    const end = topOf(to)
    return { from: start, control: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2 - 6], to: end }
  }
  if (teamOf(from) === 'decomposition') {
    const start = topOf(from)
    const end = topOf(to)
    return { from: start, control: [(start[0] + end[0]) / 2, start[1] - 60], to: end }
  }
  const start = bottomOf(from)
  const end = bottomOf(to)
  return { from: start, control: [(start[0] + end[0]) / 2, start[1] + 20 + Math.abs(end[0] - start[0]) * 0.12], to: end }
}

export const HOP_ROUTES: Record<string, QuadCurve> = Object.fromEntries(HOPS.map((hop) => [hop.key, routeFor(hop)]))
