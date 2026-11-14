import { useState } from 'react'
import { MAX_CONCURRENCY, MIN_CONCURRENCY, setConcurrency } from '@/features/run-control'

interface ConcurrencyControlProps {
  runId: string
  value: number
}

/** Сколько запросов к модели прогон шлёт одновременно; новое значение действует сразу. */
export function ConcurrencyControl({ runId, value }: ConcurrencyControlProps) {
  // Нажатое значение видно сразу и держится, пока сервер не пришлёт событие с новым лимитом.
  const [pending, setPending] = useState<{ next: number; from: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const shown = pending && pending.from === value ? pending.next : value

  const change = async (next: number) => {
    setPending({ next, from: value })
    setError(null)
    try {
      await setConcurrency(runId, next)
    } catch (e) {
      setError((e as Error).message)
      setPending(null)
    }
  }

  return (
    <div
      className={`af-seg ${error ? 'af-control-error' : ''}`}
      role="group"
      aria-label="Параллельные запросы к модели"
      title={error ?? 'Сколько запросов к модели идёт одновременно. Меняется на лету: идущие запросы доживают, следующие идут по новому лимиту.'}
    >
      <span className="af-seg-cap">параллельно</span>
      <button
        type="button"
        className="af-seg-item"
        disabled={shown <= MIN_CONCURRENCY}
        onClick={() => void change(shown - 1)}
        aria-label="Меньше параллельных запросов"
      >
        −
      </button>
      <output className="min-w-[2ch] text-center font-mono text-[13px] text-fg tabular-nums" aria-live="polite">
        {shown}
      </output>
      <button
        type="button"
        className="af-seg-item"
        disabled={shown >= MAX_CONCURRENCY}
        onClick={() => void change(shown + 1)}
        aria-label="Больше параллельных запросов"
      >
        +
      </button>
    </div>
  )
}
