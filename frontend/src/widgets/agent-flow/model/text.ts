import type { StreamRun } from '@/entities/run'

/** JSON-ответ модели → читаемая строка: без ключей, скобок и кавычек. */
export function readable(raw: string): string {
  return raw
    .replace(/```(json)?/g, ' ')
    .replace(/"[a-z_]+"\s*:/gi, ' ')
    .replace(/[{}[\]"\\`]/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/(,\s*){2,}/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,]+/, '')
    .trim()
}

/** Последняя строка потока для «бегущей» подписи: ответ, а пока его нет — рассуждение. */
export function liveLine(run: StreamRun | undefined, max = 110): { text: string; thinking: boolean } | null {
  if (!run) return null
  const thinking = run.content.length === 0
  const source = thinking ? run.reasoning : readable(run.content.slice(-max * 3))
  const text = source.replace(/\s+/g, ' ').trim()
  if (!text) return null
  return { text: text.length > max ? `…${text.slice(-max)}` : text, thinking }
}

export function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
