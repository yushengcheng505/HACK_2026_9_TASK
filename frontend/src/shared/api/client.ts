export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init)
  if (!response.ok) {
    let message = response.statusText
    try {
      const body = await response.json()
      message = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch {
      /* тело без JSON — оставляем statusText */
    }
    throw new ApiError(response.status, message)
  }
  return (await response.json()) as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  form: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
}

export const exportUrl = (runId: string, format: 'json' | 'xlsx' | 'docx') => `/api/runs/${runId}/export/${format}`
export const REPLAY_SPEED = 4
export const eventsUrl = (runId: string, replay: boolean, speed = REPLAY_SPEED) =>
  `/api/runs/${runId}/events${replay ? `?replay=1&speed=${speed}` : ''}`
