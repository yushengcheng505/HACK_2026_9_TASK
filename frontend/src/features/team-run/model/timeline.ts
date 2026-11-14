import { ROSTER, type AgentTeam } from '@/entities/agent'

/** Все значения — секунды от начала прогона. */
export const RUN_TIMELINE = {
  loopDuration: 24,
  /** Когда NAPS начинает раздавать задачи каждой команде: сначала декомпозиция, потом проверка. */
  waveStart: { decomposition: 2.2, review: 10.2 } satisfies Record<AgentTeam, number>,
  dispatchStagger: 0.3,
  flightOut: 1.2,
  /** От начала волны до момента, когда первый агент команды закончил. */
  firstDone: 3.4,
  doneStagger: 0.75,
  flightBack: 1.3,
  assemblyStart: 17.4,
  complete: 19,
} as const

/** Скорость «печати» строк в консоли NAPS, символов в секунду. */
export const TYPING_SPEED = { log: 32 } as const

export interface AgentTiming {
  dispatchedAt: number
  arrivedAt: number
  doneAt: number
  deliveredAt: number
}

export function agentTiming(index: number): AgentTiming {
  const t = RUN_TIMELINE
  const agent = ROSTER[index]
  const order = ROSTER.slice(0, index).filter((other) => other.team === agent.team).length
  const waveStart = t.waveStart[agent.team]
  const dispatchedAt = waveStart + t.dispatchStagger * order
  const doneAt = waveStart + t.firstDone + t.doneStagger * order
  return {
    dispatchedAt,
    arrivedAt: dispatchedAt + t.flightOut,
    doneAt,
    deliveredAt: doneAt + t.flightBack,
  }
}

const lastDelivered = Math.max(...ROSTER.map((_, index) => agentTiming(index).deliveredAt))

/** Моменты смены этапов «Анализ → Декомпозиция → Проверка → Сборка → готово». */
export const PHASE_STARTS = [
  RUN_TIMELINE.waveStart.decomposition,
  RUN_TIMELINE.waveStart.review,
  lastDelivered,
  RUN_TIMELINE.complete,
] as const
