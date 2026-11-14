import { useEffect, useState } from 'react'
import { ApiError, api } from '@/shared/api'

interface Publication {
  epic_key: string
  epic_url: string
  created: number
  updated: number
}

interface PublishButtonProps {
  runId: string
  ready: boolean
}

export function PublishButton({ runId, ready }: PublishButtonProps) {
  const [configured, setConfigured] = useState(false)
  const [publication, setPublication] = useState<Publication | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void api.get<{ configured: boolean }>('/tracker').then(async (tracker) => {
      if (!active) return
      setConfigured(tracker.configured)
      if (tracker.configured) {
        const run = await api.get<{ publication?: Publication | null }>(`/runs/${runId}`)
        if (active) setPublication(run.publication ?? null)
      }
    }).catch((e: unknown) => {
      if (active) setError(e instanceof ApiError ? e.message : 'Не удалось проверить настройку Jira')
    })
    return () => { active = false }
  }, [runId])

  const publish = async () => {
    setBusy(true)
    setError(null)
    try {
      setPublication(await api.post<Publication>(`/runs/${runId}/publish`))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось опубликовать в Jira')
    } finally {
      setBusy(false)
    }
  }

  if (!configured) return null

  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <button
        type="button"
        className={`af-seg-item ${!ready || busy ? 'af-seg-disabled' : ''}`}
        disabled={!ready || busy}
        onClick={() => void publish()}
      >
        {busy ? 'Публикую…' : 'В Jira'}
      </button>
      {publication && (
        <>
          <a className="af-seg-item" href={publication.epic_url} target="_blank" rel="noopener noreferrer">
            {publication.epic_key} ↗
          </a>
          <span className="font-mono text-[11px] text-fg-dim">+{publication.created} / ↻{publication.updated}</span>
        </>
      )}
      {error && <span className="text-[11px] text-hazard" role="alert">{error}</span>}
    </div>
  )
}
