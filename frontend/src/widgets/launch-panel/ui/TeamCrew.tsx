import { AGENTS, AgentAvatar } from '@/entities/agent'

interface TeamCrewProps {
  /** В форме есть текст эпика. */
  ready: boolean
  launching: boolean
}

/** Маленькая команда в шапке формы: ждёт задачу, а при запуске берётся за работу. */
export function TeamCrew({ ready, launching }: TeamCrewProps) {
  const note = launching ? 'команда приступает…' : ready ? 'команда готова, можно запускать' : `NAPS и ${AGENTS.length} агентов ждут задачу`
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-1" aria-hidden="true">
        {AGENTS.map((agent) => (
          <AgentAvatar key={agent.id} id={agent.id} size={28} state={launching ? 'working' : 'waiting'} />
        ))}
      </div>
      <span className="font-mono text-[11px] text-fg-dim" aria-live="polite">
        {note}
      </span>
    </div>
  )
}
