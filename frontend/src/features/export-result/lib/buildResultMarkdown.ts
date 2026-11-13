export interface ResultSection {
  title: string
  author: string
  text: string
}

export interface ResultDocument {
  task: string
  sections: ResultSection[]
  summary: string
}

export function buildResultMarkdown({ task, sections, summary }: ResultDocument) {
  const blocks = [
    '# Финальный результат',
    `**Задача:** ${task}`,
    ...sections.map((section) => `## ${section.title}\n\n_${section.author}_\n\n${section.text}`),
    `## Итог\n\n${summary}`,
  ]
  return `${blocks.join('\n\n')}\n`
}
