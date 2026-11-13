import { useEffect, useState } from 'react'
import { Button } from '@/shared/ui/Button'
import { buildResultMarkdown, type ResultDocument } from '../lib/buildResultMarkdown'
import { downloadTextFile } from '../lib/downloadTextFile'

type CopyState = 'idle' | 'copied' | 'failed'

const COPY_LABELS: Record<CopyState, string> = {
  idle: 'Скопировать',
  copied: 'Скопировано',
  failed: 'Не удалось',
}

const FEEDBACK_MS = 2000

interface ResultExportActionsProps {
  result: ResultDocument
}

export function ResultExportActions({ result }: ResultExportActionsProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle')

  useEffect(() => {
    if (copyState === 'idle') return
    const timer = setTimeout(() => setCopyState('idle'), FEEDBACK_MS)
    return () => clearTimeout(timer)
  }, [copyState])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildResultMarkdown(result))
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  const download = () => downloadTextFile('staya-result.md', buildResultMarkdown(result))

  return (
    <div className="flex flex-[1_1_auto] flex-wrap justify-end gap-2.5">
      <Button variant="ghost" onClick={copy} aria-live="polite">
        {COPY_LABELS[copyState]}
      </Button>
      <Button variant="primary" onClick={download}>
        Скачать .md
      </Button>
    </div>
  )
}
