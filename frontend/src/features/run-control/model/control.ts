import { api } from '@/shared/api'

/** Остановить прогон: граф сохраняет состояние, прерванный шаг при продолжении выполнится заново. */
export const pauseRun = (runId: string) => api.post<{ status: string }>(`/runs/${runId}/pause`)

/** Пределы как на сервере (app/limiter.py). */
export const MIN_CONCURRENCY = 1
export const MAX_CONCURRENCY = 32

/** Сколько запросов к модели прогон шлёт одновременно; действует сразу, и на паузе тоже. */
export const setConcurrency = (runId: string, value: number) =>
  api.put<{ concurrency: number }>(`/runs/${runId}/concurrency`, { value })

export const resumeRun = (runId: string) => api.post<{ status: string }>(`/runs/${runId}/resume`)
