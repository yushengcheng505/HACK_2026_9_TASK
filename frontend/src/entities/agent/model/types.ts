export type AgentId =
  | 'requirements'
  | 'analyst'
  | 'stories'
  | 'architect'
  | 'tasks'
  | 'reviewer'
  | 'junction'
  | 'simplifier'
  | 'skeptic'

/** waiting — ждёт своей очереди, working — занят задачей, done — справился. */
export type AgentState = 'waiting' | 'working' | 'done'

/** decomposition — раскладывают эпик на задачи, review — проверяют результат. */
export type AgentTeam = 'decomposition' | 'review'

export interface Agent {
  id: AgentId
  team: AgentTeam
  /** Должность — подпись под роботом. */
  name: string
  /** Чем занят, коротко — вторая строка подписи. */
  focus: string
}
