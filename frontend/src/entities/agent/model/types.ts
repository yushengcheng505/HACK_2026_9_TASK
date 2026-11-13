export type AgentId = 'scout' | 'lens' | 'coder' | 'editor'

export interface AgentAvatarColors {
  body: string
  stroke: string
  eye: string
}

export interface Agent {
  id: AgentId
  name: string
  /** Винительный падеж для фраз вида «ждём Ищейку…». */
  nameAccusative: string
  role: string
  avatar: AgentAvatarColors
}
