import { AGENTS } from '@/entities/agent'
import type { AgentId } from '@/entities/agent'
import type { RunView, StreamRun } from '@/entities/run'

/** queued — вызван, но ещё не начал отвечать; waiting — ждёт человека. */
export type AgentStatus = 'idle' | 'queued' | 'working' | 'done' | 'waiting' | 'failed'

export interface AgentInstance {
  /** Ключ экземпляра: `requirements`, `tasks:US-001`, `review:US-001`, `skeptic`… */
  key: string
  kind: AgentId
  name: string
  storyId?: string
  status: AgentStatus
  /** Ключи `view.calls`, из которых собран поток экземпляра. */
  callKeys: string[]
}

/** Поток моложе этого — агент «сейчас пишет». */
export const LIVE_MS = 2500

export const AGENT_NAME = Object.fromEntries(AGENTS.map((a) => [a.id, a.name])) as Record<AgentId, string>

export const AGENT_ABOUT: Record<AgentId, string> = {
  requirements: 'Выделяет из эпика, документации и контрактов атомарные требования со ссылками на источники.',
  analyst: 'Ищет неясности, пробелы и противоречия между эпиком и контрактами, задаёт вопросы. Пробелы перепроверяет Скептик.',
  stories: 'Собирает требования в пользовательские истории с критериями приёмки.',
  tasks: 'Свой на каждую историю: раскладывает её на технические задачи с DoD и тест-сценариями, переделывает по замечаниям.',
  reviewer: 'Свой на каждую историю: ищет ошибки в её задачах — пропуски, противоречия решениям, отказы внешней системы.',
  junction: 'Смотрит на весь эпик сразу: одна и та же работа в двух историях и разрывы на стыках между ними.',
  simplifier: 'Ищет лишние задачи и переусложнение — что можно не делать или сделать проще.',
  skeptic: 'Перепроверяет находки проверяющих и пробелы аналитика: подтверждает, понижает или отклоняет, чтобы доработка не ходила по кругу.',
}

/** Последний вызов среди ключей экземпляра. */
export function lastRun(view: RunView, keys: string[]): StreamRun | undefined {
  let best: StreamRun | undefined
  for (const k of keys) {
    const run = view.calls[k]?.runs.at(-1)
    if (run && (!best || run.lastAt > best.lastAt)) best = run
  }
  return best
}

const failureOf = (view: RunView, keys: string[]) => keys.map((k) => view.calls[k]?.failure).find(Boolean) ?? null

/** Проверка шла в старом режиме одного критика — рецензентов, стыков и упрощателя не было. */
export const isLegacyReview = (view: RunView) => Boolean(view.calls.critic)

/** Истории, которые проверяются в текущем заходе узла проверки. */
function reviewTargets(view: RunView): Set<string> {
  const visit = view.nodes.critic.visits
  if (visit <= 1) return new Set(view.stories.map((s) => s.id))
  const previous = view.feedback.find((f) => f.round === visit - 1) ?? view.feedback.at(-1)
  return new Set(previous?.notes.map((n) => n.story_id) ?? [])
}

/** Статус по вызову в текущем круге: пишет, закончил или ещё в очереди. */
function byCall(view: RunView, keys: string[], round: number, now: number, targeted: boolean): AgentStatus {
  const run = lastRun(view, keys)
  if (run && run.round === round) return now - run.lastAt < LIVE_MS ? 'working' : 'done'
  if (failureOf(view, keys)) return 'failed'
  return targeted ? 'queued' : run ? 'done' : 'idle'
}

function single(view: RunView, kind: 'requirements' | 'analyst' | 'stories'): AgentStatus {
  const phase = view.nodes[kind].phase
  if (kind === 'analyst' && view.waitingAnswers) return 'waiting'
  if (phase === 'active') return view.status === 'failed' ? 'failed' : 'working'
  if (phase === 'done') return 'done'
  return 'idle'
}

export function buildInstances(view: RunView, now: number): AgentInstance[] {
  const out: AgentInstance[] = []
  const add = (key: string, kind: AgentId, status: AgentStatus, callKeys: string[], storyId?: string) =>
    out.push({ key, kind, name: AGENT_NAME[kind], storyId, status, callKeys })

  add('requirements', 'requirements', single(view, 'requirements'), ['requirements'])
  add('analyst', 'analyst', single(view, 'analyst'), ['analyst'])
  add('stories', 'stories', single(view, 'stories'), ['stories'])

  const tasks = view.nodes.tasks
  for (const s of view.stories) {
    const key = `tasks:${s.id}`
    let status: AgentStatus
    if (tasks.phase === 'active') {
      const targeted = view.taskTargets.length ? view.taskTargets.includes(s.id) : !s.tasks.length
      status = byCall(view, [key], tasks.visits, now, targeted)
      if (!targeted && status === 'idle' && s.tasks.length) status = 'done'
    } else {
      status = view.calls[key]?.failure ? 'failed' : s.tasks.length || view.calls[key] ? 'done' : 'idle'
    }
    add(key, 'tasks', status, [key], s.id)
  }

  const critic = view.nodes.critic
  const legacy = isLegacyReview(view)
  const targets = reviewTargets(view)
  for (const s of view.stories) {
    const key = `review:${s.id}`
    const status =
      critic.phase === 'active' && !legacy
        ? byCall(view, [key], critic.visits, now, targets.has(s.id))
        : view.calls[key]?.failure
          ? 'failed'
          : view.calls[key]
            ? 'done'
            : 'idle'
    add(key, 'reviewer', status, [key], s.id)
  }

  for (const kind of ['junction', 'simplifier'] as const) {
    const firstRound = critic.phase === 'active' && critic.visits === 1 && !legacy
    add(kind, kind, firstRound ? byCall(view, [kind], 1, now, true) : byCall(view, [kind], -1, now, false), [kind])
  }

  const skepticKeys = ['skeptic:gaps', 'skeptic', 'critic']
  const run = lastRun(view, skepticKeys)
  const skepticLive = run && now - run.lastAt < LIVE_MS && (view.activeNode === 'analyst' || view.activeNode === 'critic')
  add('skeptic', 'skeptic', skepticLive ? 'working' : failureOf(view, skepticKeys) ? 'failed' : run ? 'done' : 'idle', skepticKeys)

  return out
}

export const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: 'ждёт',
  queued: 'в очереди',
  working: 'работает',
  done: 'готово',
  waiting: 'ждёт ответов',
  failed: 'сбой',
}
