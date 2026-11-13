import type { ReactNode } from 'react'
import type { TypedText } from '@/shared/lib/typeOut'
import { Caret } from '@/shared/ui/Caret'
import { LogoMark } from '@/shared/ui/LogoMark'

interface ResultSummaryProps {
  summary: TypedText
  actions: ReactNode
}

export function ResultSummary({ summary, actions }: ResultSummaryProps) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-4 rounded-[20px] border border-dashed border-line-input bg-ink px-5 py-[18px]">
      <LogoMark mood="happy" />
      <p className="m-0 min-h-6 flex-[999_1_380px] text-[15px] leading-[1.6] text-fg">
        <span className="font-mono text-brand">Ядро ›</span> {summary.text}
        {summary.typing && <Caret />}
      </p>
      {actions}
    </div>
  )
}
