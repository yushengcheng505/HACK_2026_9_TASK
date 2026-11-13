import { api } from '@/shared/api'

export const sendAnswers = (runId: string, answers: Record<string, string>) =>
  api.post<{ status: string }>(`/runs/${runId}/answers`, { answers })
