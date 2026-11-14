import { AGENTS, type AgentId, type AgentTeam } from '@/entities/agent'
import type { QuadCurve } from '@/shared/lib/math'

/** Координаты в системе viewBox сцены 1200×600. */
export const SCENE_SIZE = { width: 1200, height: 600 } as const

/** Роботы нарисованы в своих координатах (корпус 120×100, центр — (0, 200)) и уменьшены до AGENT_SCALE. */
export const AGENT_SCALE = 0.68
export const BOT_BODY_CENTER_Y = 200

const COLUMNS = [560, 735, 910, 1085] as const

export interface TeamRow {
  /** Центр корпусов роботов этой команды по Y. */
  bodyY: number
  /** Базовая линия подписи команды над роботами. */
  labelY: number
}

export const TEAM_ROWS: Record<AgentTeam, TeamRow> = {
  decomposition: { bodyY: 150, labelY: 44 },
  review: { bodyY: 412, labelY: 304 },
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

/** Верх антенны робота над центром корпуса и низ его чипа статуса. */
const AGENT_TOP = 70
const AGENT_BOTTOM = CAPTION.chipY + CAPTION.chipHeight + 6

/**
 * Маршруты вложены, чтобы у каждого самолётика была своя дорожка:
 * декомпозиция получает задачи сверху, отдаёт в промежуток между рядами;
 * проверка получает через промежуток, отдаёт снизу — прямо в консоль NAPS.
 */
function routeFor(id: AgentId): FlightRoute {
  const { cx, bodyY } = AGENT_SLOTS[id]
  const column = columnOf(id)
  const team = AGENTS.find((a) => a.id === id)!.team

  if (team === 'decomposition') {
    return {
      out: { from: [292, 150], control: [(292 + cx) / 2, 30 - column * 26], to: [cx, bodyY - AGENT_TOP] },
      back: { from: [cx, bodyY + AGENT_BOTTOM], control: [(cx + 300) / 2, 300 + column * 9], to: [300, 236] },
    }
  }
  return {
    out: { from: [300, 200], control: [(300 + cx) / 2, 250 + column * 8], to: [cx, bodyY - AGENT_TOP] },
    back: { from: [cx, bodyY + AGENT_BOTTOM], control: [(cx + 360) / 2, 600 + column * 6], to: [358, 468] },
  }
}

export const FLIGHT_ROUTES = Object.fromEntries(AGENTS.map((agent) => [agent.id, routeFor(agent.id)])) as Record<
  AgentId,
  FlightRoute
>
