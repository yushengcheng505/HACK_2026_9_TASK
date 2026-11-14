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

export const TEAM_LABELS: Record<AgentTeam, string> = {
  decomposition: 'Декомпозиция',
  review: 'Проверка',
}

export const teamAgents = (team: AgentTeam) => AGENTS.filter((agent) => agent.team === team)
