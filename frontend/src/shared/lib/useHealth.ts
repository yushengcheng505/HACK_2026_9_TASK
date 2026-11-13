import { useEffect, useState } from 'react'
import { api } from '@/shared/api'

export interface Health {
  status: string
  model: string
  llm_host: string
  json_mode: string
}

const LOCAL_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1|[\w-]+(:\d+)?$)/

/** Контур замкнут, если LLM живёт в локальной или внутренней сети (llama-server, vLLM за HAProxy). */
export function isClosedContour(host: string): boolean {
  return LOCAL_HOST.test(host)
}

export function useHealth(): Health | null | 'offline' {
  const [health, setHealth] = useState<Health | null | 'offline'>(null)
  useEffect(() => {
    let alive = true
    const load = () =>
      api
        .get<Health>('/health')
        .then((h) => alive && setHealth(h))
        .catch(() => alive && setHealth('offline'))
    void load()
    const timer = window.setInterval(load, 15000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])
  return health
}
