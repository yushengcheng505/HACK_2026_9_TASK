import { useEffect, useState } from 'react'

export function useElapsed(startedAt: number | null, finishedAt: number | null): string {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!startedAt || finishedAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt, finishedAt])
  if (!startedAt) return '00:00'
  const seconds = Math.max(0, Math.floor(((finishedAt ?? now) - startedAt) / 1000))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
