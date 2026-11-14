import { api } from '@/shared/api'

/** Системный промпт роли: текущий текст (с правкой из интерфейса, если есть) и исходный из backend/prompts. */
export interface PromptInfo {
  name: string
  text: string
  version: string
  default_text: string
  default_version: string
  overridden: boolean
}

export const listPrompts = () => api.get<PromptInfo[]>('/prompts')
export const savePrompt = (name: string, text: string) => api.put<PromptInfo>(`/prompts/${name}`, { text })
export const resetPrompt = (name: string) => api.delete<PromptInfo>(`/prompts/${name}`)
