import type { ReactNode } from 'react'
import { headingId, parse } from '../model/markdown'

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
        <code key={i} className="rounded-md bg-panel px-1.5 py-0.5 font-mono text-[0.88em] text-mint">
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
            <h3 key={i} id={headingId(i)} className={`scroll-mt-6 font-display font-semibold text-fg ${HEADING[block.level]}`}>
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
          <div key={i} className="overflow-x-auto rounded-2xl border border-line bg-ink/40">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="bg-panel">
                  {block.head.map((cell, j) => (
                    <th
                      key={j}
                      className="px-4 py-2.5 text-left font-mono text-[11px] font-medium whitespace-nowrap text-fg-dim"
                    >
                      {inline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, j) => (
                  <tr key={j} className="border-t border-line hover:bg-panel/60">
                    {row.map((cell, k) => (
                      <td key={k} className={`px-4 py-2.5 align-top ${k === 0 ? 'min-w-[200px] text-fg-soft' : 'font-mono tabular-nums whitespace-nowrap'}`}>
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
