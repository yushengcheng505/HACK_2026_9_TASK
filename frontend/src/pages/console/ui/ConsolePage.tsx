import { ConsoleShell } from '@/widgets/console-shell'
import { LaunchPanel } from '@/widgets/launch-panel'
import { RunsList } from '@/widgets/runs-list'
import { RunWorkspace } from '@/widgets/run-workspace'
import { useHashRoute } from '@/shared/lib/useHashRoute'

export function ConsolePage() {
  const route = useHashRoute()
  return (
    <ConsoleShell route={route}>
      {route.name === 'launch' && <LaunchPanel />}
      {route.name === 'runs' && <RunsList />}
      {route.name === 'run' && <RunWorkspace key={route.id} runId={route.id} />}
    </ConsoleShell>
  )
}
