import { api } from '@/shared/api'

export type JsonMode = 'json_schema' | 'json_object' | 'off'

/** Провайдер модели: любой OpenAI-совместимый API. Ключ сервер наружу не отдаёт — только has_key. */
export interface Provider {
  id: string
  name: string
  base_url: string
  has_key: boolean
  api_key_env: string | null
  json_mode: JsonMode
  default_model: string | null
  /** Провайдер из backend/.env — меняется только там. */
  builtin: boolean
}

export interface ProviderInput {
  name: string
  base_url: string
  /** null — оставить сохранённый ключ, '' — убрать. */
  api_key: string | null
  api_key_env: string | null
  json_mode: JsonMode
  default_model: string | null
}

export const JSON_MODES: { id: JsonMode; label: string }[] = [
  { id: 'json_schema', label: 'JSON-схема (строгий)' },
  { id: 'json_object', label: 'JSON-объект' },
  { id: 'off', label: 'без режима JSON' },
]

export const listProviders = () => api.get<Provider[]>('/providers')
export const createProvider = (input: ProviderInput) => api.post<Provider>('/providers', input)
export const updateProvider = (id: string, input: ProviderInput) => api.put<Provider>(`/providers/${id}`, input)
export const deleteProvider = (id: string) => api.delete<{ status: string }>(`/providers/${id}`)
export const listModels = (id: string) => api.get<string[]>(`/providers/${id}/models`)
