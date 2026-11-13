import { useEffect, useRef, useState } from 'react'

/** Плавно докручивает число до цели — счётчики метрик «живут» вместе с прогоном. */
export function useCountUp(target: number, duration = 420): number {
  const [value, setValue] = useState(target)
  const from = useRef(target)

  useEffect(() => {
    const start = from.current
    if (start === target) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const k = reduce ? 1 : Math.min(1, (now - t0) / duration)
      const eased = 1 - Math.pow(1 - k, 3)
      const current = start + (target - start) * eased
      from.current = current
      setValue(current)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return value
}
