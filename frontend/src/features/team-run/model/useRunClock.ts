import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Секунды с момента старта, по кругу с периодом `loopDuration`.
 * Если задан `frozenAt`, часы стоят на этом моменте.
 */
export function useRunClock(loopDuration: number, frozenAt: number | null = null) {
  const [time, setTime] = useState(frozenAt ?? 0)
  const startedAt = useRef(0)

  useEffect(() => {
    if (frozenAt !== null) return
    startedAt.current = performance.now()
    let frameId = 0
    const tick = (now: number) => {
      setTime(((now - startedAt.current) / 1000) % loopDuration)
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [loopDuration, frozenAt])

  const restart = useCallback(() => {
    startedAt.current = performance.now()
    setTime(0)
  }, [])

  return { time: frozenAt ?? time, restart }
}
