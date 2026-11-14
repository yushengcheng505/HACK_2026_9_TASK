import type { OrchestratorState } from '@/features/team-run'
import { Caret } from '@/shared/ui/Caret'
import { TypingDots } from '@/shared/ui/TypingDots'

interface OrchestratorConsoleProps {
  state: OrchestratorState
}

/** Панель статуса NAPS поверх сцены. Размеры в cqw — масштабируется вместе со сценой. */
export function OrchestratorConsole({ state }: OrchestratorConsoleProps) {
  return (
    <div className="absolute top-[59%] bottom-[4%] left-[5%] z-[1] flex w-[24.5%] flex-col gap-[0.7cqw] rounded-[1.3cqw] border border-line-strong bg-panel px-[1.25cqw] py-[1.1cqw] font-mono text-[0.98cqw]">
      <div className="flex items-center justify-between gap-[0.6cqw]">
        <span className="flex items-center gap-[0.5cqw] font-bold text-fg">
          <span>NAPS</span>
          <span className="font-medium text-brand">{state.statusWord}</span>
          {state.typing && <TypingDots />}
        </span>
        <span className="text-fg-dim">{state.progress}%</span>
      </div>

      <div
        className="h-[0.45cqw] overflow-hidden rounded-full bg-track"
        role="progressbar"
        aria-label="Прогресс выполнения"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={state.progress}
      >
        <div className="h-full rounded-full bg-brand" style={{ width: `${state.progress}%` }} />
      </div>

      <div className="flex flex-col gap-[0.45cqw] leading-[1.35] text-fg-soft">
        {state.log.map((line) => (
          <div
            key={line.key}
            className="overflow-hidden text-ellipsis whitespace-nowrap"
            style={{ opacity: line.current ? 1 : 0.55 }}
          >
            <span className="text-brand">›</span> {line.text}
            {line.current && <Caret />}
          </div>
        ))}
      </div>
    </div>
  )
}
