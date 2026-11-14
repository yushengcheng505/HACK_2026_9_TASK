import { BenchPanel } from '@/widgets/bench-panel'
import { ConsoleShell } from '@/widgets/console-shell'
import { LaunchPanel } from '@/widgets/launch-panel'
import { ModelsPanel } from '@/widgets/models-panel'
import { PromptsPanel } from '@/widgets/prompts-panel'
import { RunsList } from '@/widgets/runs-list'
import { RunWorkspace } from '@/widgets/run-workspace'
import { useHashRoute } from '@/shared/lib/useHashRoute'

export function ConsolePage() {
  const route = useHashRoute()
  const agents = route.name === 'run' && route.mode !== 'pult'
  return (
    <ConsoleShell route={route} bare={route.name === 'run'}>
      {route.name === 'launch' && <LaunchPanel />}
      {route.name === 'runs' && <RunsList />}
      {route.name === 'models' && <ModelsPanel />}
      {route.name === 'prompts' && <PromptsPanel />}
      {route.name === 'bench' && <BenchPanel />}
      {route.name === 'run' && <RunWorkspace key={route.id} runId={route.id} mode={agents ? 'agents' : 'pult'} />}
    </ConsoleShell>
  )
}
