import type { Agent, AgentTeam } from './types'

/** Порядок важен: внутри команды агенты получают задачи слева направо. */
export const AGENTS: readonly Agent[] = [
  { id: 'requirements', team: 'decomposition', name: 'Составитель', focus: 'требования' },
  { id: 'analyst', team: 'decomposition', name: 'Аналитик', focus: 'пробелы' },
  { id: 'stories', team: 'decomposition', name: 'Автор историй', focus: 'истории' },
  { id: 'tasks', team: 'decomposition', name: 'Генератор задач', focus: 'задачи' },
  { id: 'reviewer', team: 'review', name: 'Рецензент', focus: 'ошибки' },
  { id: 'junction', team: 'review', name: 'Редактор стыков', focus: 'дубли и дыры' },
  { id: 'simplifier', team: 'review', name: 'Упрощатель', focus: 'лишняя работа' },
  { id: 'skeptic', team: 'review', name: 'Скептик', focus: 'ложные находки' },
]

/** Архитектор интеграции: в реальных прогонах пока не участвует, поэтому его нет в AGENTS; витрина, консоль и сцена главной берут его из ROSTER. */
export const ARCHITECT: Agent = { id: 'architect', team: 'decomposition', name: 'Архитектор', focus: 'план интеграции' }

/** Все нарисованные роли в порядке работы: Архитектор — перед Генератором задач. */
export const ROSTER: readonly Agent[] = AGENTS.flatMap((agent) => (agent.id === 'tasks' ? [ARCHITECT, agent] : [agent]))

export const TEAM_LABELS: Record<AgentTeam, string> = {
  decomposition: 'Декомпозиция',
  review: 'Проверка',
}

export const teamAgents = (team: AgentTeam) => AGENTS.filter((agent) => agent.team === team)
