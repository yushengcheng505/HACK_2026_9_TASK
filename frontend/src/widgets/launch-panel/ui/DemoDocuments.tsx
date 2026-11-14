import { useEffect, useRef, useState } from 'react'
import type { DemoEpic, InputRole } from '@/features/launch-run'
import { ROLE_LABELS } from '@/features/launch-run'
import { Markdown } from '@/shared/ui/Markdown'

const ROLES = Object.keys(ROLE_LABELS) as InputRole[]
const fileUrl = (demoId: string, name: string) => `/api/demos/${encodeURIComponent(demoId)}/files/${encodeURIComponent(name)}`

interface DemoDocumentsProps {
  demo: DemoEpic
  initialFile: string | null
  onClose: () => void
}

export function DemoDocuments({ demo, initialFile, onClose }: DemoDocumentsProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [selected, setSelected] = useState<string | null>(initialFile)
  const [document, setDocument] = useState<{ name: string; text?: string; error?: string } | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current!
    const focused = window.document.activeElement
    const overflow = window.document.body.style.overflow
    window.document.body.style.overflow = 'hidden'
    dialog.showModal()
    return () => {
      dialog.close()
      window.document.body.style.overflow = overflow
      if (focused instanceof HTMLElement) focused.focus()
    }
  }, [])

  useEffect(() => {
    contentRef.current?.scrollTo(0, 0)
    if (!selected) return
    const controller = new AbortController()
    fetch(fileUrl(demo.id, selected), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Не удалось загрузить документ')
        return response.text()
      })
      .then((text) => setDocument({ name: selected, text }))
      .catch((error: Error) => { if (!controller.signal.aborted) setDocument({ name: selected, error: error.message }) })
    return () => controller.abort()
  }, [demo.id, selected])

  const current = document?.name === selected ? document : null
  const itemClass = (active: boolean) => `press w-full cursor-pointer rounded-xl px-3 py-2 text-left font-mono text-[12px] break-words ${active ? 'bg-panel text-brand' : 'text-fg-soft hover:bg-panel hover:text-fg'}`

  return (
    <dialog ref={dialogRef} aria-labelledby="demo-documents-title" onCancel={(event) => { event.preventDefault(); onClose() }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]')]
        const index = controls.indexOf(window.document.activeElement as HTMLElement)
        const next = (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length
        event.preventDefault()
        controls[next]?.focus()
      }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-ink/80 p-4 text-fg backdrop:bg-transparent sm:p-6">
      <section className="mx-auto flex h-full max-w-[1320px] flex-col overflow-hidden rounded-[28px] border border-line-strong bg-surface shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <span className="tag text-brand">Документы шаблона</span>
            <h2 id="demo-documents-title" className="mt-1 truncate font-display text-[19px] font-semibold" title={demo.title}>{demo.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть документы" className="press grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border border-line-strong text-[22px] text-fg-muted hover:border-brand hover:text-brand">×</button>
        </header>
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,160px)_minmax(0,1fr)] sm:grid-cols-[240px_minmax(0,1fr)] sm:grid-rows-1 lg:grid-cols-[280px_minmax(0,1fr)]">
          <nav aria-label="Документы шаблона" className="min-h-0 overflow-y-auto border-b border-line bg-ink/50 p-3 sm:border-r sm:border-b-0">
            <button type="button" onClick={() => setSelected(null)} aria-current={selected === null ? 'page' : undefined} className={itemClass(selected === null)}>Эпик</button>
            {ROLES.map((role) => {
              const files = demo.files.filter((file) => file.role === role)
              if (!files.length) return null
              return (
                <div key={role} className="mt-5">
                  <h3 className="tag mb-2 px-3 leading-relaxed text-fg-dim">{role === 'examples' ? 'Примеры кода' : ROLE_LABELS[role].label}</h3>
                  {files.map((file) => <button type="button" key={file.name} onClick={() => setSelected(file.name)}
                    aria-current={selected === file.name ? 'page' : undefined} className={itemClass(selected === file.name)}>{file.name}</button>)}
                </div>
              )
            })}
          </nav>
          <div className="flex min-h-0 min-w-0 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-6 py-3">
              <h3 className="min-w-0 truncate font-mono text-[13px] text-fg-soft">{selected ?? 'Эпик'}</h3>
              {selected && <a href={`${fileUrl(demo.id, selected)}?download=1`} download className="press shrink-0 rounded-full border border-line-strong px-3 py-1.5 font-mono text-[12px] text-fg-muted hover:border-brand hover:text-brand">Скачать ↓</a>}
            </div>
            <div ref={contentRef} tabIndex={0} role="region" aria-label="Содержимое документа" className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain p-6" aria-live="polite" aria-busy={selected !== null && !current}>
              {selected === null ? <Markdown source={demo.epic_text} /> : !current ? <p className="tag text-fg-dim">Загрузка…</p> : current.error ? <p role="alert" className="font-mono text-[13px] text-hazard">{current.error}</p> : /\.(md|markdown)$/i.test(selected) ? <Markdown source={current.text ?? ''} /> : (
                <pre className="min-w-max font-mono text-[12px] leading-[1.7] text-fg-soft">{(current.text ?? '').split('\n').map((line, index) => (
                  <span key={index} className="block"><span aria-hidden="true" className="mr-5 inline-block w-8 select-none text-right text-fg-dim">{index + 1}</span>{line || '\u00a0'}</span>
                ))}</pre>
              )}
            </div>
          </div>
        </div>
      </section>
    </dialog>
  )
}
