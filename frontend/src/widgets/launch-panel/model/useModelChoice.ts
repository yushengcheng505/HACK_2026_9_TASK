import { useEffect, useState } from 'react'
import type { LaunchModel } from '@/features/launch-run'
import type { Provider } from '@/features/manage-providers'
import { listProviders } from '@/features/manage-providers'
import { MAX_CONCURRENCY, MIN_CONCURRENCY } from '@/features/run-control'
import { api } from '@/shared/api'
import type { Health } from '@/shared/lib/useHealth'

const STORAGE_KEY = 'synaps.model-choice'
const CONCURRENCY_KEY = 'synaps.concurrency'

const clamp = (n: number) => Math.min(MAX_CONCURRENCY, Math.max(MIN_CONCURRENCY, Math.round(n)))

function stored(): LaunchModel | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    return value && typeof value.providerId === 'string' ? { providerId: value.providerId, model: String(value.model ?? '') } : null
  } catch {
    return null
  }
}

/** Выбор провайдера, модели и параллельности для запуска; выбор запоминается в браузере. */
export function useModelChoice() {
  const [providers, setProviders] = useState<Provider[] | null>(null)
  const [choice, setChoice] = useState<LaunchModel | null>(null)
  const [concurrency, setConcurrencyState] = useState<number | null>(() => {
    const saved = Number(localStorage.getItem(CONCURRENCY_KEY))
    return saved ? clamp(saved) : null
  })

  useEffect(() => {
    listProviders()
      .then((list) => {
        setProviders(list)
        const saved = stored()
        const provider = list.find((p) => p.id === saved?.providerId) ?? list[0]
        if (provider) setChoice(saved?.providerId === provider.id ? saved : { providerId: provider.id, model: provider.default_model ?? '' })
      })
      .catch(() => setProviders([]))
    api
      .get<Health>('/health')
      .then((h) => setConcurrencyState((current) => current ?? clamp(h.concurrency || 1)))
      .catch(() => setConcurrencyState((current) => current ?? 1))
  }, [])

  const change = (next: LaunchModel) => {
    setChoice(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  const changeConcurrency = (next: number) => {
    const value = clamp(next)
    setConcurrencyState(value)
    localStorage.setItem(CONCURRENCY_KEY, String(value))
  }

  return { providers, choice, change, concurrency, changeConcurrency }
}
