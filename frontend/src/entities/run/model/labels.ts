import type { SourceRef } from './types'

export function shortOp(source: SourceRef): { name: string; scope: string } {
  if (source.kind === 'openapi_op') {
    const [method, ...path] = source.id.replace(/^API:/, '').split(' ')
    return { name: `${method} ${path.join(' ')}`, scope: source.file }
  }
  const id = source.id.replace(/^PROTO:/, '')
  const dot = id.lastIndexOf('.')
  return dot === -1 ? { name: id, scope: source.file } : { name: id.slice(dot + 1), scope: id.slice(0, dot) }
}

export const TASK_TYPE: Record<string, { label: string; cls: string }> = {
  backend: { label: 'BACK', cls: 'text-fg-soft border-line-strong' },
  frontend: { label: 'FRONT', cls: 'text-mint border-mint/40' },
  integration: { label: 'INTG', cls: 'text-brand border-brand/50' },
  db: { label: 'DB', cls: 'text-fg-muted border-line-strong' },
  qa: { label: 'QA', cls: 'text-amber border-amber/50' },
  devops: { label: 'OPS', cls: 'text-fg-dim border-line-input' },
}

export const REQ_TYPE: Record<string, string> = {
  functional: 'FUNC',
  integration: 'INTG',
  nonfunctional: 'NFR',
}
