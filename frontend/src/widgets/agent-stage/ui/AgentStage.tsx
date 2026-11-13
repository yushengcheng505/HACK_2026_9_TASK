import type { RunFrame } from '@/features/team-run'
import { StageScene } from './scene/StageScene'
import { StageToolbar } from './StageToolbar'
import { TaskForm } from './TaskForm'

interface AgentStageProps {
  frame: RunFrame
  task: string
  onTaskChange: (task: string) => void
  onRun: () => void
}

export function AgentStage({ frame, task, onTaskChange, onRun }: AgentStageProps) {
  return (
    <section
      id="stage"
      aria-label="Агенты за работой"
      className="rounded-[28px] border border-line bg-surface p-5 shadow-[0_30px_80px_rgba(0,0,0,0.45)]"
    >
      <StageToolbar phase={frame.phase} />
      <StageScene frame={frame} />
      <TaskForm task={task} onTaskChange={onTaskChange} onRun={onRun} />
    </section>
  )
}
