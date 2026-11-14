import type { DemoEpic } from '@/features/launch-run'
import { fileKind } from '@/features/launch-run'
import type { EpicTemplate } from '../model/templates'

interface TemplateCardProps {
  template: EpicTemplate
  /** Приложенные файлы — только у демо-эпиков бэкенда. */
  files?: DemoEpic['files']
  /** Текст шаблона сейчас стоит в форме слева. */
  inForm: boolean
  launching: boolean
  disabled: boolean
  onTake: () => void
  /** Запуск целиком, вместе с документами и контрактами. */
  onLaunch?: () => void
}

export function TemplateCard({ template, files, inForm, launching, disabled, onTake, onLaunch }: TemplateCardProps) {
  return (
    <article
      className={`fx-enter flex flex-col gap-4 rounded-[22px] border bg-panel p-5 transition-colors duration-200 ${
        inForm ? 'border-brand/70 shadow-[0_0_0_1px_rgb(1_222_130/0.25),0_0_28px_rgb(1_222_130/0.08)]' : 'border-line'
      }`}
    >
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {template.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-line-strong px-2.5 py-0.5 font-mono text-[11px] text-fg-dim">
              {tag}
            </span>
          ))}
          {inForm && (
            <span className="rounded-full bg-brand-deep px-2.5 py-0.5 font-mono text-[11px] font-bold text-brand">в форме</span>
          )}
        </div>
        <h3 className="font-display text-[17px] leading-snug font-semibold text-fg">{template.title}</h3>
        <p className="text-[14px] leading-relaxed text-fg-muted">{template.summary}</p>
      </div>

      <pre className="max-h-[230px] overflow-y-auto overscroll-contain rounded-2xl border border-line-input bg-ink px-4 py-3.5 font-mono text-[12.5px] leading-[1.65] whitespace-pre-wrap text-fg-soft">
        {template.text}
      </pre>

      {files && files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((file) => (
            <span key={file.name} className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-ink px-2.5 py-1">
              <span className="font-mono text-[10px] font-bold tracking-wider text-brand">{fileKind(file.name)}</span>
              <span className="font-mono text-[12px] text-fg-soft">{file.name}</span>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        {onLaunch && (
          <button
            type="button"
            disabled={disabled}
            onClick={onLaunch}
            className="press inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-brand px-5 font-display text-[13px] font-semibold text-ink hover:bg-brand-hover disabled:cursor-wait disabled:opacity-60"
          >
            {launching ? 'Запускаю…' : 'Запустить с документами'}
            <span aria-hidden="true">→</span>
          </button>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={onTake}
          className={`press inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-5 font-display text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
            onLaunch
              ? 'border border-line-input text-fg hover:border-brand hover:text-brand'
              : 'bg-brand text-ink hover:bg-brand-hover'
          }`}
        >
          {onLaunch ? 'Только текст в форму' : 'Взять в работу'}
          {!onLaunch && <span aria-hidden="true">→</span>}
        </button>
      </div>
    </article>
  )
}
