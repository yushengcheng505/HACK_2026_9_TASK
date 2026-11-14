import { ROSTER, type AgentId } from '@/entities/agent'

/** Конец перелёта: агент или NAPS. */
export type HopEnd = AgentId | 'naps'

/** Перелёт самолётика между участниками; время — секунды от начала прогона. */
export interface Hop {
  key: string
  from: HopEnd
  to: HopEnd
  start: number
  end: number
}

export interface AgentTiming {
  /** Первый самолётик к агенту вылетел. */
  dispatchedAt: number
  /** Все входящие самолётики долетели — агент берётся за работу. */
  arrivedAt: number
  doneAt: number
  /** Последний исходящий самолётик долетел. */
  deliveredAt: number
}

/** Длительности, секунды. */
const PACE = {
  start: 1.6,
  work: 1.3,
  /** Соседи в одном ряду. */
  nearHop: 0.9,
  /** Через всю сцену: от NAPS, между рядами, вдоль нижнего ряда к Скептику. */
  farHop: 1.25,
  resultHop: 1.6,
  /** Проверяющие получают работу одновременно, а заканчивают по очереди. */
  checkStagger: 0.3,
  assembly: 1.4,
  /** Сколько держим финальный кадр перед повтором. */
  hold: 4.6,
} as const

const SKEPTIC: AgentId = 'skeptic'
const decomposition = ROSTER.filter((agent) => agent.team === 'decomposition').map((agent) => agent.id)
const checkers = ROSTER.filter((agent) => agent.team === 'review' && agent.id !== SKEPTIC).map((agent) => agent.id)

/**
 * Связи как на графе прогона в консоли: декомпозиция идёт по цепочке, Генератор задач отдаёт работу
 * всем проверяющим, их находки сходятся у Скептика, а итог от Скептика прилетает NAPS.
 */
function schedule() {
  const hops: Hop[] = []
  const arrived = new Map<AgentId, number>()
  const done = new Map<AgentId, number>()
  const fly = (from: HopEnd, to: HopEnd, start: number, duration: number) => {
    const end = start + duration
    hops.push({ key: `${from}-${to}`, from, to, start, end })
    if (to !== 'naps') arrived.set(to, Math.max(arrived.get(to) ?? 0, end))
    return end
  }

  fly('naps', decomposition[0], PACE.start, PACE.farHop)
  decomposition.forEach((id, index) => {
    done.set(id, arrived.get(id)! + PACE.work)
    const next = decomposition[index + 1]
    if (next) fly(id, next, done.get(id)!, PACE.nearHop)
  })

  const last = decomposition[decomposition.length - 1]
  checkers.forEach((id, index) => {
    fly(last, id, done.get(last)!, PACE.farHop)
    done.set(id, arrived.get(id)! + PACE.work + PACE.checkStagger * index)
    fly(id, SKEPTIC, done.get(id)!, PACE.farHop)
  })
  done.set(SKEPTIC, arrived.get(SKEPTIC)! + PACE.work)
  const resultAt = fly(SKEPTIC, 'naps', done.get(SKEPTIC)!, PACE.resultHop)

  const timing = Object.fromEntries(
    ROSTER.map((agent) => {
      const incoming = hops.filter((hop) => hop.to === agent.id)
      const outgoing = hops.filter((hop) => hop.from === agent.id)
      return [
        agent.id,
        {
          dispatchedAt: Math.min(...incoming.map((hop) => hop.start)),
          arrivedAt: arrived.get(agent.id)!,
          doneAt: done.get(agent.id)!,
          deliveredAt: Math.max(...outgoing.map((hop) => hop.end)),
        },
      ]
    }),
  ) as Record<AgentId, AgentTiming>

  return { hops, timing, reviewStart: done.get(last)!, resultAt }
}

const plan = schedule()

export const HOPS: readonly Hop[] = plan.hops
export const AGENT_TIMING = plan.timing

export const RUN_TIMELINE = {
  start: PACE.start,
  /** Генератор задач закончил — работа ушла проверяющим. */
  reviewStart: plan.reviewStart,
  /** Итог долетел до NAPS — он собирает результат. */
  assemblyStart: plan.resultAt,
  complete: plan.resultAt + PACE.assembly,
  loopDuration: plan.resultAt + PACE.assembly + PACE.hold,
} as const

/** Скорость «печати» строк в консоли NAPS, символов в секунду. */
export const TYPING_SPEED = { log: 32 } as const

/** Моменты смены этапов «Анализ → Декомпозиция → Проверка → Сборка → готово». */
export const PHASE_STARTS = [RUN_TIMELINE.start, RUN_TIMELINE.reviewStart, RUN_TIMELINE.assemblyStart, RUN_TIMELINE.complete] as const
