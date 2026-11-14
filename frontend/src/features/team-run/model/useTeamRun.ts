import { useMemo, useState } from 'react'
import { computeRunFrame } from './computeRunFrame'
import { readFrozenTime } from './frozenTime'
import { DEMO_TASK } from './scenario'
import { RUN_TIMELINE } from './timeline'
import { useRunClock } from './useRunClock'

export function useTeamRun() {
  const [frozenAt] = useState(readFrozenTime)
  const { time } = useRunClock(RUN_TIMELINE.loopDuration, frozenAt)
  const frame = useMemo(() => computeRunFrame(time), [time])

  return { frame, task: DEMO_TASK }
}
