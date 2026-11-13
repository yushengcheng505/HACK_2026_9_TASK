import { AgentAvatar } from '@/entities/agent'
import type { AgentRunState } from '@/features/team-run'
import { Caret } from '@/shared/ui/Caret'

function markFor({ delivered, status }: AgentRunState) {
  if (delivered) return '✓ готово'
  return status === 'working' ? 'в работе' : 'в очереди'
}

function waitingNote({ agent, status }: AgentRunState) {
  return status === 'working' ? `${agent.name} работает над этим…` : `ждём ${agent.nameAccusative}…`
}

interface ResultCardProps {
  state: AgentRunState
}

export function ResultCard({ state }: ResultCardProps) {
  const { agent, delivered, deliverable, revealed } = state

  return (
    <article
      data-agent={agent.id}
      className={`flex min-h-[176px] flex-col gap-3 rounded-[20px] border bg-surface p-5 ${
        delivered ? 'border-brand-mid' : 'border-line'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <AgentAvatar colors={agent.avatar} />
        <span className="text-[14px] font-bold">{agent.name}</span>
        <span className="font-mono text-[12px] text-fg-dim">· {agent.role}</span>
        <span className={`ml-auto font-mono text-[12px] ${delivered ? 'text-brand' : 'text-fg-dim'}`}>
          {markFor(state)}
        </span>
      </div>

      <h3 className={`m-0 font-display text-[17px] font-medium ${delivered ? 'text-fg' : 'text-fg-dim'}`}>
        {deliverable.title}
      </h3>

      {delivered ? (
        <p className="fx-reveal m-0 text-[15px] leading-[1.6] text-fg-soft">
          {revealed.text}
          {revealed.typing && <Caret />}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2" aria-hidden="true">
            <div className="h-2.5 w-[92%] rounded-md bg-track" />
            <div className="h-2.5 w-[74%] rounded-md bg-track" />
          </div>
          <p className="m-0 font-mono text-[12.5px] text-fg-dim">{waitingNote(state)}</p>
        </>
      )}
    </article>
  )
}
