import { useEffect, useSyncExternalStore } from 'react'
import type { LaunchModel } from '@/features/launch-run'
import { listProviders } from '@/features/manage-providers'
import type { Provider } from '@/features/manage-providers'
import { MAX_CONCURRENCY, MIN_CONCURRENCY } from '@/features/run-control'
import { api } from '@/shared/api'
import type { Health } from '@/shared/lib/useHealth'

const STORAGE_KEY = 'synaps.model-choice'
const CONCURRENCY_KEY = 'synaps.concurrency'
const clamp = (n: number) => Math.min(MAX_CONCURRENCY, Math.max(MIN_CONCURRENCY, Math.round(n)))

function storedChoice(): LaunchModel | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    return value && typeof value.providerId === 'string' ? { providerId: value.providerId, model: String(value.model ?? '') } : null
  } catch {
    return null
  }
}

function storedConcurrency(): number | null {
  try {
    const saved = Number(localStorage.getItem(CONCURRENCY_KEY))
    return saved && Number.isFinite(saved) ? clamp(saved) : null
  } catch {
    return null
  }
}

let state: { providers: Provider[] | null; choice: LaunchModel | null; concurrency: number | null } = {
  providers: null,
  choice: null,
  concurrency: storedConcurrency(),
}
const listeners = new Set<() => void>()
let started = false
let loading: Promise<void> | null = null
const snapshot = () => state
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
const publish = (next: Partial<typeof state>) => {
  state = { ...state, ...next }
  listeners.forEach((listener) => listener())
}
const persist = (key: string, value: string) => {
  try { localStorage.setItem(key, value) } catch { /* Выбор остаётся в памяти, если хранилище недоступно. */ }
}

export function reloadProviders(): Promise<void> {
  if (loading) return loading
  loading = listProviders()
    .then((providers) => {
      const saved = state.choice ?? storedChoice()
      const provider = providers.find((p) => p.id === saved?.providerId) ?? providers[0]
      const choice = provider ? (saved?.providerId === provider.id ? saved : { providerId: provider.id, model: provider.default_model ?? '' }) : null
      publish({ providers, choice })
    })
    .catch(() => { if (state.providers === null) publish({ providers: [] }) })
    .finally(() => { loading = null })
  return loading
}

const change = (choice: LaunchModel) => {
  publish({ choice })
  persist(STORAGE_KEY, JSON.stringify(choice))
}
const changeConcurrency = (next: number) => {
  if (!Number.isFinite(next)) return
  const concurrency = clamp(next)
  publish({ concurrency })
  persist(CONCURRENCY_KEY, String(concurrency))
}

export function useModelChoice() {
  const current = useSyncExternalStore(subscribe, snapshot)
  useEffect(() => {
    if (started) return
    started = true
    void reloadProviders()
    api.get<Health>('/health')
      .then((h) => { if (state.concurrency === null) publish({ concurrency: clamp(h.concurrency || 1) }) })
      .catch(() => { if (state.concurrency === null) publish({ concurrency: 1 }) })
  }, [])
  return { ...current, change, changeConcurrency }
}
