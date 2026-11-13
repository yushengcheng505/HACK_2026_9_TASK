import type { Decomposition } from '@/entities/run'
import { api } from '@/shared/api'

/** Правки сохраняются, а бэкенд заново прогоняет только проверки кодом — без новой генерации. */
export const saveResult = (runId: string, result: Decomposition) => api.put<Decomposition>(`/runs/${runId}/result`, result)
