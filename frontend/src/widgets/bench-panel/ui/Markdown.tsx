import type { ReactNode } from 'react'

type Block =
  | { kind: 'h'; level: number; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] }

const LIST = /^(?:[-*]|\d+\.)\s+/
const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

/** Разбор подмножества markdown из отчётов бенчмарка: заголовки, абзацы, списки, pipe-таблицы. */
function parse(source: string): Block[] {
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

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
      return (
        <strong key={i} className="font-semibold text-fg">
          {part.slice(2, -2)}
        </strong>
      )
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
      return (
        <code key={i} className="rounded bg-panel px-1.5 py-0.5 font-mono text-[0.88em] text-mint">
          {part.slice(1, -1)}
        </code>
      )
    return part
  })
}

const HEADING = ['', 'text-[26px] tracking-[-0.02em]', 'mt-4 text-[20px]', 'mt-2 text-[16px]', 'text-[15px]']

export function Markdown({ source }: { source: string }) {
  return (
    <div className="flex flex-col gap-4 text-[14px] leading-[1.7] text-fg-muted">
      {parse(source).map((block, i) => {
        if (block.kind === 'h')
          return (
            <h3 key={i} className={`font-display font-semibold text-fg ${HEADING[block.level]}`}>
              {inline(block.text)}
            </h3>
          )
        if (block.kind === 'p') return <p key={i}>{inline(block.text)}</p>
        if (block.kind === 'ul' || block.kind === 'ol') {
          const List = block.kind
          return (
            <List key={i} className={`flex flex-col gap-1.5 pl-5 ${block.kind === 'ul' ? 'list-disc' : 'list-decimal'} marker:text-brand-mid`}>
              {block.items.map((item, j) => (
                <li key={j}>{inline(item)}</li>
              ))}
            </List>
          )
        }
        return (
          <div key={i} className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="bg-panel">
                  {block.head.map((cell, j) => (
                    <th key={j} className="px-3 py-2 text-left font-mono text-[11px] font-medium whitespace-nowrap text-fg-dim">
                      {inline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, j) => (
                  <tr key={j} className="border-t border-line hover:bg-panel/60">
                    {row.map((cell, k) => (
                      <td key={k} className={`px-3 py-2 align-top ${k === 0 ? 'min-w-[260px] text-fg-soft' : 'font-mono tabular-nums whitespace-nowrap'}`}>
                        {inline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
