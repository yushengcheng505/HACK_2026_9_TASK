import { useEffect, useId, useState } from 'react'
import { listModels } from '@/features/manage-providers'
import { MAX_CONCURRENCY, MIN_CONCURRENCY } from '@/features/run-control'
import { routeHref } from '@/shared/lib/useHashRoute'
import { useModelChoice } from '../model/modelChoice'

const fieldClass = 'w-full min-w-0 rounded-xl border border-line-input bg-ink px-3 py-2 font-mono text-[12px] text-fg focus:border-brand'

export function ModelPicker() {
  const { providers, choice, change, concurrency, changeConcurrency } = useModelChoice()
  const [available, setAvailable] = useState<{ providerId: string; models: string[] } | null>(null)
  const listId = useId()
  const provider = providers?.find((p) => p.id === choice?.providerId)

  useEffect(() => {
    if (!provider) return
    let alive = true
    listModels(provider.id)
      .then((models) => { if (alive) setAvailable({ providerId: provider.id, models }) })
      .catch(() => { if (alive) setAvailable({ providerId: provider.id, models: [] }) })
    return () => { alive = false }
  }, [provider])

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="tag text-fg-dim">[ Модель ]</span>
        <a href={routeHref({ name: 'models' })} className="font-mono text-[11px] text-fg-dim hover:text-brand">настроить</a>
      </div>
      {providers === null && <span className="tag text-fg-dim">загрузка…</span>}
      {providers?.length === 0 && <span className="font-mono text-[12px] text-fg-dim">Нет провайдеров</span>}
      {choice && providers && (
        <>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="tag text-fg-dim">Провайдер</span>
            <select aria-label="Провайдер" value={choice.providerId} className={fieldClass} onChange={(e) => {
              const next = providers.find((p) => p.id === e.target.value)
              if (next) change({ providerId: next.id, model: next.default_model ?? '' })
            }}>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="tag text-fg-dim">Модель</span>
            <input aria-label="Модель" list={listId} value={choice.model} onChange={(e) => change({ ...choice, model: e.target.value })}
              placeholder={provider?.default_model ?? 'модель провайдера'} title={choice.model} className={fieldClass} />
          </label>
          <datalist id={listId}>
            {(available?.providerId === choice.providerId ? available.models : []).map((model) => <option key={model} value={model} />)}
          </datalist>
        </>
      )}
      {concurrency !== null && (
        <label className="flex flex-col gap-1.5" title="Сколько запросов к модели идёт одновременно">
          <span className="tag text-fg-dim">параллельно</span>
          <input type="number" aria-label="Параллельных запросов" min={MIN_CONCURRENCY} max={MAX_CONCURRENCY} value={concurrency}
            onChange={(e) => { if (e.target.value) changeConcurrency(Number(e.target.value)) }} className={`${fieldClass} tabular-nums`} />
        </label>
      )}
    </div>
  )
}
