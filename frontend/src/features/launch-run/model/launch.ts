import { api } from '@/shared/api'

export type InputRole = 'product_docs' | 'external_docs' | 'contracts' | 'examples'

export interface DemoEpic {
  id: string
  title: string
  summary: string
  epic_text: string
  files: { name: string; role: InputRole }[]
}

export const ROLE_LABELS: Record<InputRole, { label: string; hint: string; accept: string }> = {
  product_docs: { label: 'Документация продукта', hint: 'md · txt · docx', accept: '.md,.markdown,.txt,.docx' },
  external_docs: { label: 'Документация смежной системы', hint: 'md · txt · docx', accept: '.md,.markdown,.txt,.docx' },
  contracts: { label: 'API-контракты', hint: '.proto · OpenAPI yaml/json', accept: '.proto,.yaml,.yml,.json' },
  examples: { label: 'Примеры и реализованные контракты', hint: 'код · .proto · yaml', accept: '*' },
}

export const listDemos = () => api.get<DemoEpic[]>('/demos')

export const startDemo = (demoId: string, skipQuestions: boolean) =>
  api.post<{ run_id: string }>(`/demos/${demoId}/run`, { skip_questions: skipQuestions })

export function startCustom(input: {
  title: string
  text: string
  skipQuestions: boolean
  files: Record<InputRole, File[]>
}) {
  const form = new FormData()
  form.set('title', input.title)
  form.set('text', input.text)
  form.set('skip_questions', String(input.skipQuestions))
  for (const [role, files] of Object.entries(input.files)) {
    for (const file of files) form.append(role, file)
  }
  return api.form<{ run_id: string }>('/runs', form)
}

export function fileKind(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'proto') return 'PROTO'
  if (ext === 'yaml' || ext === 'yml' || ext === 'json') return 'OPENAPI'
  if (ext === 'md' || ext === 'txt' || ext === 'docx') return 'DOC'
  return ext.toUpperCase() || 'FILE'
}
