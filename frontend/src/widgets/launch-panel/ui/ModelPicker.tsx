import { useEffect, useState } from 'react'
import type { LaunchModel } from '@/features/launch-run'
import type { Provider } from '@/features/manage-providers'
import { listModels } from '@/features/manage-providers'
import { MAX_CONCURRENCY, MIN_CONCURRENCY } from '@/features/run-control'
import { routeHref } from '@/shared/lib/useHashRoute'

interface ModelPickerProps {
  providers: Provider[] | null
  choice: LaunchModel | null
  onChange: (choice: LaunchModel) => void
  concurrency: number | null
  onConcurrencyChange: (value: number) => void
}

const fieldClass = 'min-w-0 rounded-xl border border-line-input bg-ink px-3 py-2 text-[13px] text-fg focus:border-brand'

export function ModelPicker({ providers, choice, onChange, concurrency, onConcurrencyChange }: ModelPickerProps) {
  const [models, setModels] = useState<string[]>([])
  const providerId = choice?.providerId

  useEffect(() => {
    if (!providerId) return
    let alive = true
    listModels(providerId)
      .then((list) => alive && setModels(list))
      .catch(() => alive && setModels([]))
    return () => {
      alive = false
    }
  }, [providerId])

  if (!providers || !choice) return null
  const provider = providers.find((p) => p.id === choice.providerId)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[11px] tracking-[0.1em] text-fg-dim uppercase">Модель</span>
      <select
        aria-label="Провайдер"
        value={choice.providerId}
        onChange={(e) => {
          const next = providers.find((p) => p.id === e.target.value)
          if (next) onChange({ providerId: next.id, model: next.default_model ?? '' })
        }}
        className={fieldClass}
      >
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <input
        aria-label="Модель"
        list="launch-models"
        value={choice.model}
        onChange={(e) => onChange({ ...choice, model: e.target.value })}
        placeholder={provider?.default_model ?? 'модель провайдера'}
        className={`${fieldClass} w-[220px] font-mono`}
      />
      <datalist id="launch-models">
        {models.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      {concurrency !== null && (
        <label className="flex items-center gap-1.5" title="Сколько запросов к модели идёт одновременно; можно поменять и во время прогона">
          <span className="font-mono text-[11px] tracking-[0.1em] text-fg-dim uppercase">параллельно</span>
          <input
            type="number"
            aria-label="Параллельных запросов"
            min={MIN_CONCURRENCY}
            max={MAX_CONCURRENCY}
            value={concurrency}
            onChange={(e) => e.target.value && onConcurrencyChange(Number(e.target.value))}
            className={`${fieldClass} w-[64px] font-mono tabular-nums`}
          />
        </label>
      )}
      <a href={routeHref({ name: 'models' })} className="font-mono text-[12px] text-fg-dim hover:text-brand">
        настроить
      </a>
    </div>
  )
}
