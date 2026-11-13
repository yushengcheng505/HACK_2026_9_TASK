import { useTeamRun } from '@/features/team-run'
import { AgentStage } from '@/widgets/agent-stage'
import { Hero } from '@/widgets/hero'
import { RunResult } from '@/widgets/run-result'
import { SiteFooter } from '@/widgets/site-footer'
import { SiteHeader } from '@/widgets/site-header'

export function HomePage() {
  const { frame, task, setTask, restart } = useTeamRun()

  return (
    <div className="min-h-screen bg-ink font-sans text-fg">
      <div className="mx-auto max-w-[1240px] px-6 pb-10">
        <SiteHeader />
        <main>
          <Hero />
          <AgentStage frame={frame} task={task} onTaskChange={setTask} onRun={restart} />
          <RunResult frame={frame} task={task} />
        </main>
        <SiteFooter />
      </div>
    </div>
  )
}
