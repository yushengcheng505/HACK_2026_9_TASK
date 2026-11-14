export type Block =
  | { kind: 'h'; level: number; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] }

const LIST = /^(?:[-*]|\d+\.)\s+/
const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

/** Разбор подмножества markdown из отчётов бенчмарка: заголовки, абзацы, списки, pipe-таблицы. */
export function parse(source: string): Block[] {
  const blocks: Block[] = []
  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = raw.trim()
    if (!line) continue
    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      blocks.push({ kind: 'h', level: heading[1].length, text: heading[2] })
      continue
    }
    if (line.startsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]))
      i--
      const [head = [], , ...body] = rows
      blocks.push({ kind: 'table', head, rows: rows[1]?.every((c) => /^:?-+:?$/.test(c)) ? body : rows.slice(1) })
      continue
    }
    if (LIST.test(line)) {
      const kind = /^\d+\./.test(line) ? 'ol' : 'ul'
      const items: string[] = []
      while (i < lines.length) {
        const next = lines[i].trim()
        if (LIST.test(next)) items.push(next.replace(LIST, ''))
        else if (next && /^\s/.test(lines[i]) && !next.startsWith('|')) items[items.length - 1] += ` ${next}`
        else break
        i++
      }
      i--
      blocks.push({ kind, items })
      continue
    }
    const text = [line]
    while (i + 1 < lines.length && lines[i + 1].trim() && !/^(#|\||[-*]\s|\d+\.\s)/.test(lines[i + 1].trim())) text.push(lines[++i].trim())
    blocks.push({ kind: 'p', text: text.join(' ') })
  }
  return blocks
}

export const headingId = (index: number) => `bench-h-${index}`

/** Разделы второго уровня для оглавления; индексы совпадают с id заголовков в `Markdown`. */
export function outline(source: string): { id: string; text: string }[] {
  return parse(source).flatMap((block, i) =>
    block.kind === 'h' && block.level === 2 ? [{ id: headingId(i), text: block.text.replace(/\*\*|`/g, '') }] : [],
  )
}

