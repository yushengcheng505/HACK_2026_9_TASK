import type { ResultStatus } from '@/features/team-run'

function labelFor(status: ResultStatus) {
  switch (status.kind) {
    case 'collecting':
      return `формируется · ${status.delivered}/${status.total}`
    case 'assembling':
      return 'собираю…'
    case 'ready':
      return '✓ готово'
  }
}

interface ResultStatusPillProps {
  status: ResultStatus
}

export function ResultStatusPill({ status }: ResultStatusPillProps) {
  const look =
    status.kind === 'ready'
      ? 'border-brand bg-brand font-bold text-ink'
      : 'border-line-muted text-mint'

  return (
    <span className={`rounded-full border px-3.5 py-[9px] font-mono text-[13px] ${look}`} aria-live="polite">
      {labelFor(status)}
    </span>
  )
}
