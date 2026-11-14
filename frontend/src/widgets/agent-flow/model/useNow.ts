import { useEffect, useState } from 'react'

/** Текущее время с тиком, пока `live`: статусы «пишет сейчас» зависят от свежести потока. */
export function useNow(live: boolean, interval = 500): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!live) return
    const timer = window.setInterval(() => setNow(Date.now()), interval)
    return () => window.clearInterval(timer)
  }, [live, interval])
  return now
}
