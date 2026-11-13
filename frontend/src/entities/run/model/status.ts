import type { RunStatus } from './types'

export const STATUS_LABEL: Record<RunStatus, { text: string; cls: string; dot: string }> = {
  running: { text: 'В работе', cls: 'text-brand', dot: 'bg-brand fx-pulse' },
  waiting_answers: { text: 'Ждёт ответов', cls: 'text-amber', dot: 'bg-amber fx-pulse-amber' },
  done: { text: 'Готово', cls: 'text-fg-soft', dot: 'bg-brand' },
  failed: { text: 'Сбой', cls: 'text-hazard', dot: 'bg-hazard' },
}
