import { AGENTS } from '@/entities/agent'

/** Все значения — секунды от начала прогона. */
export const RUN_TIMELINE = {
  loopDuration: 20,
  dispatchStart: 2.4,
  dispatchStagger: 0.35,
  flightOut: 1.3,
  firstAgentDone: 6.5,
  doneStagger: 1.1,
  flightBack: 1.5,
  assemblyStart: 11.7,
  complete: 13.5,
} as const

/** Скорость «печати» текста, символов в секунду. */
export const TYPING_SPEED = {
  log: 32,
  result: 110,
  summary: 70,
} as const

export interface AgentTiming {
  dispatchedAt: number
  arrivedAt: number
  doneAt: number
  deliveredAt: number
}

export function agentTiming(index: number): AgentTiming {
  const t = RUN_TIMELINE
  const dispatchedAt = t.dispatchStart + t.dispatchStagger * index
  const doneAt = t.firstAgentDone + t.doneStagger * index
  return {
    dispatchedAt,
    arrivedAt: dispatchedAt + t.flightOut,
    doneAt,
    deliveredAt: doneAt + t.flightBack,
  }
}

const lastAgentTiming = agentTiming(AGENTS.length - 1)

/** Моменты смены этапов «Анализ → Распределение → Выполнение → Сборка → готово». */
export const PHASE_STARTS = [
  RUN_TIMELINE.dispatchStart,
  lastAgentTiming.arrivedAt,
  lastAgentTiming.deliveredAt,
  RUN_TIMELINE.complete,
] as const
